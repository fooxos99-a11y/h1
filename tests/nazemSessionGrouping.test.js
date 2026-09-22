import test from 'node:test';
import assert from 'node:assert/strict';
import { groupNazemLogEntries } from '../src/lib/nazemLogGroups.js';
import { nazemIssueMessage } from '../src/lib/nazemSyncIssues.js';
import { nazemWriteFailure } from '../server/integrations/nazem/writeFailure.js';
import { recitationWriteJournal, recoverRejectedRecitationWrite } from '../server/integrations/nazem/recitationSubmission.js';
import { NazemAdapter } from '../server/integrations/nazem/adapter.js';
import { buildNazemLogEntries } from '../server/integrations/nazem/log.js';

const entry = { teacherId: 1, studentId: 2, studentName: 'محمد', planId: 3, taskDate: '2026-09-22', operationType: 'recitation.submit', entryKind: 'current', jobId: 10 };
test('old send recovery requires a later explicit 422 event and cannot unlock uncertain writes', async () => {
  for (const change of [{}, { metadata: { diagnostics: { httpStatus: 503 } } }, { occurredAt: 0 }, { message: 'رفض الحفظ' }]) {
    const job = { id: 3, payload: { deliveryWrites: [{ path: '/item/5', startedAt: '2026-09-22T10:00:00Z' }] } };
    let updates = 0;
    const event = { code: 'NAZEM_FOLLOW_UP_SAVE_REJECTED', message: 'يجب إنهاء الأيام السابقة', occurredAt: Date.parse('2026-09-22T10:00:01Z'), metadata: { diagnostics: { httpStatus: 422 } }, ...change };
    const connection = { query: async sql => {
      if (sql.startsWith('SELECT')) return [[event]];
      updates++; return [{ affectedRows: 1 }];
    } };
    assert.equal(await recoverRejectedRecitationWrite(connection, job), Object.keys(change).length === 0);
    assert.equal(updates, Object.keys(change).length === 0 ? 1 : 0);
  }
});
test('student session groups attendance and tracks, but isolates dates, plans, teachers and equal names', () => {
  const rows = [entry, { ...entry, jobId: 11, taskType: 'link' }, { ...entry, jobId: 12, operationType: 'attendance.submit' },
    { ...entry, jobId: 13, studentId: 4 }, { ...entry, jobId: 14, taskDate: '2026-09-21' },
    { ...entry, jobId: 15, planId: 4 }, { ...entry, jobId: 16, teacherId: 9 }];
  const groups = groupNazemLogEntries(rows);
  assert.equal(groups.length, 5);
  assert.equal(groups[0].entries.length, 3);
});
test('previous failures remain history and cannot replace a current success', () => {
  const groups = groupNazemLogEntries([{ ...entry, status: 'synced' }, { ...entry, entryKind: 'history', status: 'blocked' }]);
  assert.equal(groups[0].entries[0].status, 'synced');
  assert.equal(groups[0].history.length, 1);
});
test('recent log events cannot push an unresolved current operation past the result limit', () => {
  const rows = buildNazemLogEntries([{ ...entry, status: 'blocked', createdAt: '2026-09-01' }],
    [{ ...entry, id: 21, entryKind: 'history', status: 'retrying', createdAt: '2026-09-22' }], 1);
  assert.equal(rows[0].entryKind, 'current');
});
test('missing follow-up attendance identifies the operation and date without claiming recitation', () => {
  const message = nazemIssueMessage({ errorCode: 'NAZEM_FOLLOW_UP_STUDENT_MISSING', operationType: 'attendance.submit', taskDate: '2026-09-22' });
  assert.match(message, /الحضور محفوظ/);
  assert.match(message, /2026-09-22/);
  assert.doesNotMatch(message, /التسميع/);
});
test('remote validation dependency is blocked, missing day needs identity review, and transport retries are bounded by queue', () => {
  assert.equal(nazemWriteFailure(422, 'يجب إنهاء متابعة الأيام السابقة أولاً').code, 'NAZEM_PREVIOUS_DAYS_BLOCKING');
  assert.equal(nazemWriteFailure(422, 'اليوم غير موجود').code, 'NAZEM_SAVED_TARGET_CHANGED');
  assert.equal(nazemWriteFailure(503, '').retryable, true);
  assert.equal(nazemWriteFailure(422, 'رفض').retryable, false);
  assert.equal(nazemWriteFailure(401, '').code, 'NAZEM_SESSION_EXPIRED');
});

test('explicit previous-day rejection may retry after resolution, but accepted and uncertain writes cannot repeat', async () => {
  for (const mode of ['rejected', 'timeout', 'accepted']) {
    const job = { id: 1, payload: {} };
    const adapter = new NazemAdapter();
    adapter.recitationJournal = recitationWriteJournal({ query: async () => [{ affectedRows: 1 }] }, job);
    let writes = 0;
    adapter.postFollowUpApi = async () => {
      writes++;
      if (mode === 'timeout') throw new Error('timeout');
      if (mode === 'rejected' && writes === 1) throw nazemWriteFailure(422, 'يجب إنهاء الأيام السابقة');
      return { status: true };
    };
    if (mode === 'accepted') await adapter.postRecitationApi('/item/1', {});
    else await assert.rejects(adapter.postRecitationApi('/item/1', {}));
    if (mode === 'rejected') {
      assert.ok(job.payload.deliveryWrites[0].rejectedAt);
      await adapter.postRecitationApi('/item/1', {});
      assert.equal(writes, 2);
    } else {
      await assert.rejects(adapter.postRecitationApi('/item/1', {}), { code: 'NAZEM_DELIVERY_UNVERIFIED' });
      assert.equal(writes, 1);
    }
  }
});
