import test from 'node:test';
import assert from 'node:assert/strict';
import { importNazemFollowUpHistory, describeNazemFollowUpIssues } from '../server/integrations/nazem/followUpImport.js';
import { nazemErrorDiagnostics } from '../server/integrations/nazem/errorDiagnostics.js';
import { resolveLegacyRecitationTarget } from '../server/integrations/nazem/recitationSubmission.js';

const studentLink = { nazemStudentId: '87' }, planLink = { nazemPlanId: '52' };
const daily = { id: 1482242, taskType: 'link', taskDate: '2026-09-03', localSnapshot: { attemptIds: [2604] } };
const source = { id: 770166, date: daily.taskDate, remoteType: 'conserve', status: 'pending', nazemLate: false };
const scope = { daily, recitations: [{ id: 2604, taskType: 'link' }], studentLink, planLink, attemptId: 2604 };
const connection = (sourceOverride = source) => ({ query: async sql => {
  assert.match(sql, /^SELECT/);
  return [[{ source: sourceOverride, studentExternalId: '87', planExternalId: '52' }]];
} });

test('old link can identify its same-date memorization parent without any database write', async () => {
  const result = await resolveLegacyRecitationTarget(connection(), scope);
  assert.equal(result.source.id, 770166);
  assert.deepEqual(result.attemptIds, [2604]);
});

test('legacy parent from another date or a late item never becomes a verified source', async () => {
  for (const change of [{ date: '2026-09-04' }, { nazemLate: true }, { remoteType: 'revision' }]) {
    await assert.rejects(resolveLegacyRecitationTarget(connection({ ...source, ...change }), scope), { code: 'NAZEM_LEGACY_SOURCE_UNVERIFIED' });
  }
});

test('legacy recovery rejects changed attempts instead of silently using the newest ones', async () => {
  await assert.rejects(resolveLegacyRecitationTarget(connection(), { ...scope, recitations: [{ id: 2605 }] }), { code: 'NAZEM_SUBMISSION_IDENTITY_CHANGED' });
});

test('an unidentified legacy source remains distinct from a known identity mismatch', async () => {
  await assert.rejects(resolveLegacyRecitationTarget(connection(null), scope), { code: 'NAZEM_LEGACY_SOURCE_UNVERIFIED' });
});

test('partial refresh preserves each cause, student and date through event diagnostics', async () => {
  const day = { date: '2026-09-14', taskType: 'review' };
  const result = await importNazemFollowUpHistory({ attendance: [day], scheduledFollowUps: [day], followUps: [day] }, { studentId: 67 }, {
    applyAttendance: async () => false,
    syncScheduled: async () => ({ matched: false, reason: 'task_started' }),
    saveFollowUp: async () => ({ review: 1, conflicts: 1, issueCode: 'NAZEM_LOCAL_RESULT_CONFLICT' }),
  });
  assert.equal(result.review, 3);
  const diagnostics = nazemErrorDiagnostics({ details: { issues: result.issues } });
  assert.deepEqual(diagnostics.issues.map(x => x.code), ['NAZEM_ATTENDANCE_REQUIRES_REVIEW', 'NAZEM_STARTED_TASK_RANGE_CHANGED', 'NAZEM_LOCAL_RESULT_CONFLICT']);
  assert.ok(diagnostics.issues.every(x => x.studentId === 67 && x.taskDate === day.date));
  assert.match(describeNazemFollowUpIssues(result.issues), /1 من الطلاب/);
});

test('issue diagnostics exclude raw errors, credentials and unrecognized fields', () => {
  const diagnostics = nazemErrorDiagnostics({ details: { issues: [{ studentId: 67, code: 'NAZEM_LOCAL_RESULT_CONFLICT', password: 'secret', message: 'token=secret', taskDate: 'secret' }, { code: 'token=secret' }] } });
  assert.deepEqual(diagnostics.issues, [{ studentId: 67, code: 'NAZEM_LOCAL_RESULT_CONFLICT' }]);
});
