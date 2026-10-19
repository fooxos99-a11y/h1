import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectNazemLateSession } from '../server/services/nazemLateSelection.js';
import { processRecitationSessionBatch } from '../server/services/recitationBatch.js';
import { canMarkRecitationNotCompleted } from '../shared/nazem-recitation-policy.js';
import { recitationErrorMessage } from '../src/lib/recitationErrorMessage.js';

test('missing or unauthorized task identities produce an honest conflict before any write', async () => {
  let calls = 0;
  const issue = await inspectNazemLateSession({ query: async () => { calls++; return [[]]; } },
    { studentId: 9, tasks: [{ taskId: 7 }] }, 11);
  assert.equal(calls, 1); assert.equal(issue.result, 'conflict');
  assert.equal(issue.code, 'RECITATION_TASK_UNAVAILABLE');
  assert.doesNotMatch(issue.message, /المتأخرات|الأقدم/);
});

test('native storage failures are distinct from network errors and never expose plugin internals', () => {
  const message = recitationErrorMessage(new Error('CreateConnection: Connection madarij_offline_recitation already exists'));
  assert.match(message, /بيانات التسميع على الجهاز/);
  assert.doesNotMatch(message, /CreateConnection|madarij_offline|بالخادم/);
});
test('a blocked old plan cannot prevent independent review or a new plan for that student', async () => {
  const session = (id, type, planId = 1) => ({ sessionId: String(id), studentId: 9, sessionDate: '2026-10-19',
    committedAtLocal: String(id), tasks: [{ taskId: id, taskType: type, taskDate: '2026-10-19', planId }] });
  const sessions = [session(1, 'memorization'), session(2, 'link'), session(3, 'review'), session(4, 'memorization', 2)];
  const ran = [];
  const results = await processRecitationSessionBatch(sessions, async current => {
    ran.push(current.sessionId);
    return { result: current.sessionId === '1' ? 'conflict' : 'accepted', tasks: [{ message: current.sessionId === '1' ? 'خطة قديمة' : '' }] };
  });
  assert.deepEqual(ran, ['1', '3', '4']);
  assert.equal(results[1].blockedBySessionId, '1');
  assert.match(results[1].message, /الحفظ بتاريخ 2026-10-19/);
});
test('local linking supports not completed while settled, locked and unknown tasks stay protected', () => {
  assert.equal(canMarkRecitationNotCompleted({ taskType: 'link' }), true);
  assert.equal(canMarkRecitationNotCompleted({ taskType: 'link', locallySaved: true }), false);
  assert.equal(canMarkRecitationNotCompleted({ taskType: 'link', teacherCompleted: 1 }), false);
  assert.equal(canMarkRecitationNotCompleted({ taskType: 'link', nazemManaged: true, nazemSubmissionLocked: true }), false);
  assert.equal(canMarkRecitationNotCompleted({ taskType: 'other' }), false);
});

test('a late recorded after today is replayed first by its source date, independent of device timestamps', async () => {
  const make = (id, taskDate, committedAtLocal) => ({ sessionId: id, studentId: 9, sessionDate: '2026-10-19', committedAtLocal,
    tasks: [{ taskId: id === 'late' ? 1 : 2, taskType: 'memorization', taskDate, planId: 7, nazemManaged: true }] });
  const late = make('late', '2026-10-14', '2026-10-19T15:30:00Z');
  const today = make('today', '2026-10-19', '2026-10-19T15:20:00Z');
  const ran = [];
  await processRecitationSessionBatch([today, late], async session => { ran.push(session.sessionId); return { result: 'accepted' }; });
  assert.deepEqual(ran, ['late', 'today']);
});

test('an explicitly unavailable old task remains a conflict without blocking a valid new task in the same plan', async () => {
  const make = id => ({ sessionId: String(id), studentId: 9, sessionDate: '2026-10-19', committedAtLocal: String(id),
    tasks: [{ taskId: id, planId: 7, taskType: 'review' }] });
  const results = await processRecitationSessionBatch([make(1), make(2)], async session => session.sessionId === '1'
    ? { result: 'conflict', code: 'RECITATION_TASK_UNAVAILABLE' } : { result: 'accepted' });
  assert.deepEqual(results.map(row => row.result), ['conflict', 'accepted']);
});
