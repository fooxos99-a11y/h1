import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nazemStudentRefreshState, recordNazemStudentRefresh } from '../server/integrations/nazem/refreshState.js';
import { shouldShowRecitationStudent } from '../src/lib/recitationActionState.js';

const now = 1_000_000;
const base = { managed: true, studentId: 8, now, refresh: { status: 'syncing', createdEpochMs: now - 1000, payload: { checkedStudentIds: [7] } } };

test('only missing unchecked student amounts wait for the teacher refresh', () => {
  assert.equal(nazemStudentRefreshState(base).amountRefreshPending, true);
  assert.equal(nazemStudentRefreshState({ ...base, studentId: 7 }).amountRefreshPending, false);
  for (const override of [{ hasTasks: true }, { finished: true }, { managed: false }]) {
    assert.deepEqual(nazemStudentRefreshState({ ...base, ...override }), { amountRefreshPending: false, amountRefreshFailed: false, amountRefreshDelayed: false });
  }
});

test('slow refresh is labeled delayed and partial failures do not affect already refreshed students', () => {
  const delayed = nazemStudentRefreshState({ ...base, now: now + 121_000 });
  assert.equal(delayed.amountRefreshPending, false);
  assert.equal(delayed.amountRefreshDelayed, true);
  assert.equal(delayed.amountRefreshFailed, false);
  const refresh = { ...base.refresh, status: 'requires_review', payload: JSON.stringify(base.refresh.payload) };
  assert.equal(nazemStudentRefreshState({ ...base, refresh }).amountRefreshFailed, true);
  assert.equal(nazemStudentRefreshState({ ...base, refresh, studentId: 7 }).amountRefreshFailed, false);
});

test('completed student remains hidden during teacher refresh but available late work stays visible', () => {
  const student = { studentId: 8, attendanceStatus: 'present', nazemManaged: true, recitationFinished: true, ...nazemStudentRefreshState({ ...base, finished: true }) };
  assert.equal(shouldShowRecitationStudent(student), false);
  assert.equal(shouldShowRecitationStudent(student, [{ studentId: 8, taskType: 'memorization', nazemManaged: true }]), true);
  assert.equal(shouldShowRecitationStudent({ ...student, nazemRemainingDue: [{ taskType: 'memorization' }] }), false);
});

test('per-student refresh progress is lease protected and deduplicated', async () => {
  let recorded;
  await recordNazemStudentRefresh({ query: async (sql, params) => { recorded = { sql, params }; } }, { id: 2, leaseOwner: 'worker' }, [8, 8, 9]);
  assert.match(recorded.sql, /status = 'syncing' AND lease_owner = \?/);
  assert.deepEqual(recorded.params, ['[8,9]', 2, 'worker']);
});

test('interactive refresh reads today including late items without rereading seven days', () => {
  const source = readFileSync(new URL('../server/integrations/nazem/service.js', import.meta.url), 'utf8');
  const refresh = source.slice(source.indexOf('async function refreshTeacherFollowUps'), source.indexOf('async function reconcileTeacher'));
  assert.match(refresh, /readStudentFollowUpHistory\([\s\S]*?\}, 1, \{\s*endDate: job\.operationType === 'account\.daily_reconcile' \? job\.payload\.workDate : null,\s*confirmedRecordIds: await loadConfirmedNazemRecordIds\(connection, \{ \.\.\.link, teacherId: job\.teacherId \}\)\s*\}\)/);
  assert.match(refresh, /timing\.fetchMs/);
  assert.match(refresh, /timing\.importMs/);
  assert.match(refresh, /queueWaitMs/);
});
