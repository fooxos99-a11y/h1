import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeCommittedOfflineEvaluation } from '../src/lib/offlineEvaluationMerge.js';
import { isRecitationActionPending } from '../src/lib/recitationActionState.js';
import { mergeRecitationDeliveryReceipts } from '../src/lib/recitationDeliveryReceipts.js';
import { loadRecitationDeliveryReceipts } from '../server/services/recitationDeliveryReceipts.js';

const task = { id: 1, studentId: 8, planId: 17, planVersion: 1, taskDate: '2026-09-08', taskType: 'memorization', nazemManaged: true, attemptCount: 0 };
const evaluation = { date: task.taskDate, tasks: [task], taskQueue: [task], students: [{ studentId: 8, studentName: 'طالب الاختبار', attendanceStatus: 'present' }] };
const session = { status: 'synced', studentId: 8, sessionDate: evaluation.date, tasks: [{ taskId: 1, planId: 17, planVersion: 1,
  taskType: 'memorization', nazemManaged: true, synced: true, result: { ok: true, teacherCompleted: true, syncStatus: 'pending' } }] };

test('a stale snapshot cannot reintroduce the exact acknowledged task, including after a device reload', () => {
  for (const restored of [session, JSON.parse(JSON.stringify(session))]) {
    assert.deepEqual(mergeCommittedOfflineEvaluation(evaluation, [restored]).tasks, []);
  }
  for (const teacherCompleted of [true, 1]) assert.equal(isRecitationActionPending({ ...task, teacherCompleted }), false);
});
test('new dates wait for authority while changed plans and retries override old acknowledgements', () => {
  const next = { ...task, id: 2, taskDate: '2026-09-09' };
  assert.deepEqual(mergeCommittedOfflineEvaluation({ ...evaluation, taskQueue: [task, next] }, [session]).tasks.map(row => row.id), []);
  for (const changed of [{ ...task, planVersion: 2 }, { ...task, planId: 99 }, { ...task, evaluatedAt: '2026-09-08 16:00', teacherCompleted: false }]) {
    assert.equal(mergeCommittedOfflineEvaluation({ ...evaluation, tasks: [changed], taskQueue: [changed] }, [session]).tasks.length, 1);
  }
  assert.equal(mergeCommittedOfflineEvaluation(evaluation, [{ ...session, sessionDate: '2026-09-07' }]).tasks.length, 1);
  assert.equal(mergeCommittedOfflineEvaluation(evaluation, [{ ...session, status: 'rejected_permission' }]).tasks.length, 1);
});
test('failed ordinary evaluations can be retried and unproven per-task acknowledgements do not hide work', () => {
  const ordinary = { ...task, nazemManaged: false };
  const failed = { ...session, tasks: [{ ...session.tasks[0], result: { ok: true, teacherCompleted: false } }] };
  assert.equal(mergeCommittedOfflineEvaluation({ ...evaluation, tasks: [ordinary], taskQueue: [ordinary] }, [failed]).tasks.length, 1);
  const missing = { ...session, tasks: [{ ...session.tasks[0], result: null }] };
  assert.equal(mergeCommittedOfflineEvaluation(evaluation, [missing]).tasks.length, 1);
});
test('device/server acknowledgements never claim Nazem confirmation and remote failure stays visible', () => {
  assert.equal(mergeRecitationDeliveryReceipts(evaluation, [session])[0].status, 'nazem_pending');
  assert.equal(mergeRecitationDeliveryReceipts(evaluation, [{ ...session, status: 'pending' }])[0].status, 'local_saved');
  const remote = { taskId: 1, status: 'nazem_failed', error: 'تعذر الاتصال بناظم' };
  assert.deepEqual(mergeRecitationDeliveryReceipts({ ...evaluation, deliveryReceipts: [remote] }, [session]), [remote]);
});
test('server receipts require remote evidence and distinguish adoption from submission within teacher scope', async () => {
  const connection = { query: async (sql, params) => {
    assert.match(sql, /a\.is_official = 1/);
    assert.match(sql, /sc\.supervisor_id = \? AND sc\.committee_id = s\.committee_id/);
    assert.deepEqual(params, [11, 11, task.taskDate, 11]);
    const base = { linkId: 1, syncStatus: 'synced', confirmedAt: '2026-09-08', remoteSnapshot: '{"id":9}' };
    return [[base, { ...base, importedFromNazem: 'true' }, { ...base, remoteSnapshot: '{}' },
      { ...base, syncStatus: 'failed' }, { ...base, linkId: null }, { ...base, linkId: null, nazemManaged: 1 }]];
  } };
  assert.deepEqual((await loadRecitationDeliveryReceipts(connection, 11, task.taskDate)).map(row => row.status),
    ['nazem_confirmed', 'nazem_adopted', 'nazem_pending', 'nazem_failed', 'server_saved', 'nazem_pending']);
});


test('partial acceptance survives reload without hiding the unaccepted task', () => {
  const second = { ...task, id: 2, taskType: 'review' };
  const partial = { ...session, status: 'failed', tasks: [{ ...session.tasks[0], syncResultCode: 'accepted' }, { taskId: 2, synced: false }] };
  const restored = JSON.parse(JSON.stringify(partial));
  const result = mergeCommittedOfflineEvaluation({ ...evaluation, tasks: [task, second], taskQueue: [task, second] }, [restored]);
  assert.deepEqual(result.tasks.map(row => row.id), [2]);
  assert.equal(result.deliveryReceipts.find(row => row.taskId === 1).status, 'nazem_pending');
  assert.equal(result.deliveryReceipts.find(row => row.taskId === 2).status, 'local_failed');
});

test('local receipts use attempt time rather than storage order and exclude another plan version', () => {
  const old = { ...session, sessionId: 'old', committedAtLocal: '2026-09-08T10:00:00Z', status: 'failed', tasks: [{ ...session.tasks[0], synced: false, result: null }] };
  const current = { ...session, sessionId: 'new', committedAtLocal: '2026-09-08T11:00:00Z' };
  for (const rows of [[old, current], [current, old]]) {
    assert.equal(mergeRecitationDeliveryReceipts(evaluation, rows)[0].status, 'nazem_pending');
  }
  const retry = { ...old, sessionId: 'retry', committedAtLocal: '2026-09-08T12:00:00Z' };
  for (const rows of [[retry, current], [current, retry]]) {
    assert.equal(mergeRecitationDeliveryReceipts(evaluation, rows)[0].status, 'local_failed');
  }
  const changed = { ...task, planVersion: 2 };
  assert.deepEqual(mergeRecitationDeliveryReceipts({ ...evaluation, tasks: [changed], taskQueue: [changed] }, [session]), []);
});
