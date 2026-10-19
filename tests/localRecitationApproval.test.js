import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { canMarkRecitationNotCompleted, canMarkNazemNotCompleted } from '../shared/nazem-recitation-policy.js';
import { mergeCommittedOfflineEvaluation } from '../src/lib/offlineEvaluationMerge.js';
import { mergeRecitationDeliveryReceipts } from '../src/lib/recitationDeliveryReceipts.js';
import { loadRecitationDeliveryReceipts } from '../server/services/recitationDeliveryReceipts.js';

const task = { id: 1, studentId: 8, planId: 17, planVersion: 1, taskType: 'memorization',
  taskDate: '2026-10-13', nazemManaged: false, teacherCompleted: null };
const evaluation = { date: task.taskDate, tasks: [task], taskQueue: [task],
  students: [{ studentId: 8, nazemManaged: false, attendanceStatus: 'present' }] };
const receipt = { sessionId: 'local', status: 'synced', studentId: 8, sessionDate: task.taskDate,
  tasks: [{ taskId: 1, planId: 17, planVersion: 1, taskType: 'memorization', nazemManaged: true,
    synced: true, result: { ok: true, teacherCompleted: true, syncStatus: 'synced' } }] };

test('local memorization, review and linking expose negative results without requiring Nazem', () => {
  for (const taskType of ['memorization', 'review', 'link']) {
    assert.equal(canMarkRecitationNotCompleted({ ...task, taskType }), true);
    assert.equal(canMarkNazemNotCompleted({ ...task, taskType }), false);
    assert.equal(canMarkRecitationNotCompleted({ ...task, taskType, teacherCompleted: true }), false);
    assert.equal(canMarkRecitationNotCompleted({ ...task, taskType, locallySaved: true }), false);
  }
  assert.equal(canMarkRecitationNotCompleted({ ...task, nazemManaged: true, nazemSubmissionLocked: true }), false);
});

test('accepted local recitation immediately becomes finished rather than pending after a stale snapshot', () => {
  const result = mergeCommittedOfflineEvaluation(evaluation, [receipt]);
  assert.deepEqual(result.tasks, []);
  assert.equal(result.students[0].recitationFinished, true);
  assert.equal(result.students[0].recitationPending, false);
  assert.equal(result.deliveryReceipts[0].status, 'server_saved');
});

test('local approval retains unfinished review and rejected negative results remain retryable', () => {
  const review = { ...task, id: 2, taskType: 'review' };
  const result = mergeCommittedOfflineEvaluation({ ...evaluation, tasks: [task, review], taskQueue: [task, review] }, [receipt]);
  assert.deepEqual(result.tasks.map(item => item.id), [2]);
  assert.equal(result.students[0].recitationFinished, false);
  assert.equal(result.students[0].recitationPending, false);
  const failed = { ...receipt, tasks: [{ ...receipt.tasks[0], result: { ok: true, teacherCompleted: false, syncStatus: 'synced' } }] };
  assert.equal(mergeCommittedOfflineEvaluation(evaluation, [failed]).tasks.length, 1);
});

test('offline saves still wait for acknowledgement and do not falsely mark completion', () => {
  const pending = { ...receipt, status: 'pending', tasks: [{ ...receipt.tasks[0], synced: false, result: null }] };
  const result = mergeCommittedOfflineEvaluation(evaluation, [pending]);
  assert.equal(result.students[0].recitationFinished, false);
  assert.equal(result.students[0].recitationPending, true);
  assert.equal(result.deliveryReceipts[0].status, 'local_saved');
});

test('current local task and student identity override a historical device Nazem flag', () => {
  const old = { ...receipt, tasks: [{ ...receipt.tasks[0], result: { ok: true, teacherCompleted: true, syncStatus: 'pending' } }] };
  assert.equal(mergeRecitationDeliveryReceipts(evaluation, [old])[0].status, 'server_saved');
  assert.equal(mergeRecitationDeliveryReceipts({ ...evaluation, tasks: [], taskQueue: [] }, [old])[0].status, 'server_saved');
  const remote = { ...evaluation, tasks: [{ ...task, nazemManaged: true }], taskQueue: [{ ...task, nazemManaged: true }] };
  assert.equal(mergeRecitationDeliveryReceipts(remote, [old])[0].status, 'nazem_pending');
});

test('server receipt status uses the current connection even when old Nazem failures remain', async () => {
  const connection = { query: async sql => {
    assert.match(sql, /account.status = 'connected'/);
    assert.match(sql, /setting.setting_value = 'true'/);
    return [[{ taskId: 1, nazemManaged: 0, linkId: 5, syncStatus: 'failed', error: 'old remote error' },
      { taskId: 2, nazemManaged: 1, linkId: 6, syncStatus: 'failed' }]];
  } };
  assert.deepEqual((await loadRecitationDeliveryReceipts(connection, 11, task.taskDate)).map(row => row.status), ['server_saved', 'nazem_failed']);
});

test('immediate sync reads the exact durable receipt and guards account changes during either await', async () => {
  const source = await readFile(new URL('../src/services/offlineRecitationService.js', import.meta.url), 'utf8');
  const definition = source.slice(source.indexOf('export async function syncCommittedRecitation('), source.indexOf('\nasync function syncSession('))
    .replace('export async', 'async');
  for (const phase of ['accepted', 'post', 'cache', 'missing']) {
    let version = 1;
    const approved = { sessionId: 'exact', status: 'synced' };
    const confirm = vm.runInNewContext(`${definition}\nsyncCommittedRecitation;`, {
      getAuthSessionVersion: () => version,
      recitationActorKey: id => `tenant:supervisor:${id}`,
      syncOfflineRecitations: async (id, options) => {
        assert.equal(id, 9); assert.equal(options.force, true);
        if (phase === 'post') version += 1;
      },
      offlineRecitationStore: { getSessions: async key => {
        assert.equal(key, 'tenant:supervisor:9');
        if (phase === 'cache') version += 1;
        return phase === 'missing' ? [{ sessionId: 'other', status: 'synced' }] : [approved];
      } },
    });
    if (['post', 'cache'].includes(phase)) await assert.rejects(confirm(9, 'exact'), /تغير الحساب/);
    else assert.equal(await confirm(9, 'exact'), phase === 'missing' ? undefined : approved);
  }
});

test('background save reports the exact durable receipt when a batch snapshot is stale', async () => {
  const source = await readFile(new URL('../src/components/portal/TeacherEvaluationDialog.jsx', import.meta.url), 'utf8');
  const definition = source.slice(source.indexOf('  const syncRecitationInBackground ='), source.indexOf('  const finishRecitationSave ='));
  for (const status of ['synced', 'conflict']) {
    const notices = [];
    let finish;
    const refreshed = new Promise(resolve => { finish = resolve; });
    const callback = vm.runInNewContext(`${definition}\nsyncRecitationInBackground;`, {
      useCallback: fn => fn, navigator: { onLine: true }, supervisorId: 11,
      syncOfflineRecitations: async () => [{ sessionId: 'exact', status: 'conflict' }],
      syncCommittedRecitation: async (id, sessionId) => {
        assert.equal(id, 11); assert.equal(sessionId, 'exact'); return { sessionId, status };
      },
      assertSessionAccepted: receipt => { if (receipt.status === 'conflict') throw Error('rejected'); },
      load: async () => { finish(); }, toast: value => notices.push(value), recitationErrorMessage: error => error.message,
    });
    callback('exact');
    await refreshed;
    assert.equal(notices.length, status === 'synced' ? 0 : 1);
  }
});
