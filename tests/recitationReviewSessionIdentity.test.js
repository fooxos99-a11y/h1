import test from 'node:test';
import assert from 'node:assert/strict';
import { recitationSessionTypeForTask, normalizeRecitationSessionType } from '../shared/offline-recitation.js';
import { claimRecitationSession } from '../server/services/offlineRecitation.js';
import { resolveReviewSessionIdentity } from '../server/services/recitationReviewSessionIdentity.js';
import { validateRecitationTarget } from '../server/integrations/nazem/recitationSubmission.js';
import { mergeCommittedOfflineEvaluation } from '../src/lib/offlineEvaluationMerge.js';

const task = { id: 379087, studentId: 11, planId: 19, taskDate: '2026-09-14', taskType: 'review', nazemManaged: true, fromSurah: 58, fromAyah: 1, toSurah: 59, toAyah: 9 };
const previous = '10000000-0000-4000-a000-000000000001';
const candidate = 'f0000000-0000-4000-a000-000000000002';
const req = { auth: { role: 'supervisor', id: 148 }, body: { sessionId: candidate } };

function database(previousTaskId) {
  const slots = new Map([['review:2026-09-14', { sessionId: previous, eventTimeTrusted: 0 }]]);
  const changes = [];
  return { slots, changes, query: async (sql, args) => {
    if (sql.includes('AND (EXISTS (SELECT 1 FROM student_quran_recitation_session_parts')) return [[previousTaskId === args[3] ? { sessionId: previous } : undefined].filter(Boolean)];
    if (sql.includes('FROM recitation_devices')) return [[{ actorRole: 'supervisor', actorId: 148 }]];
    if (sql.includes('FROM student_quran_recitation_daily_slots')) return [[slots.get(args[2])].filter(Boolean)];
    if (sql.includes('INSERT INTO student_quran_recitation_daily_slots')) {
      slots.set(args[2], { sessionId: args[3], eventTimeTrusted: 0 }); return [{ affectedRows: 1 }];
    }
    if (/INSERT|UPDATE/.test(sql)) { changes.push({ sql, args }); return [{ affectedRows: 1 }]; }
    throw Error(`Unexpected SQL: ${sql}`);
  } };
}

test('distinct Nazem reviews on the same day use distinct durable device and server keys', () => {
  const first = recitationSessionTypeForTask({ ...task, id: 378661 });
  const second = recitationSessionTypeForTask(task);
  assert.notEqual(first, second);
  assert.equal(normalizeRecitationSessionType(second), second);
  assert.ok(second.length <= 40);
  assert.equal(recitationSessionTypeForTask({ ...task, nazemManaged: false }), 'review');
  assert.equal(recitationSessionTypeForTask({ ...task, taskType: 'memorization' }), 'memorization:2026-09-14');
});

test('a new review is accepted without superseding the earlier review or its results', async () => {
  const db = database(378661);
  const result = await claimRecitationSession(db, { req, task, sessionDate: task.taskDate, requestId: candidate });
  assert.equal(result.accepted, true);
  assert.equal(db.slots.get('review:2026-09-14').sessionId, previous);
  assert.equal(db.slots.get(recitationSessionTypeForTask(task)).sessionId, candidate);
  assert.equal(db.changes.some(x => /is_official = 0|EARLIER_TRUSTED_SESSION/.test(x.sql)), false);
});

test('the exact review already accepted under a legacy slot remains protected', async () => {
  const db = database(task.id);
  assert.equal(await resolveReviewSessionIdentity(db, task, task.taskDate, recitationSessionTypeForTask(task)), 'review:2026-09-14');
  const result = await claimRecitationSession(db, { req, task, sessionDate: task.taskDate, requestId: candidate });
  assert.equal(result.accepted, false);
  assert.equal(result.winningSessionId, previous);
  assert.equal(db.slots.size, 1);
});

test('a second session for the new review is still rejected', async () => {
  const db = database(378661);
  db.slots.set(recitationSessionTypeForTask(task), { sessionId: previous, eventTimeTrusted: 0 });
  const result = await claimRecitationSession(db, { req, task, sessionDate: task.taskDate, requestId: candidate });
  assert.equal(result.accepted, false);
});

test('a confirmed device receipt hides only the accepted review, leaving the new amount available', () => {
  const oldTask = { ...task, id: 378661 };
  const result = mergeCommittedOfflineEvaluation({ date: task.taskDate, tasks: [oldTask, task], taskQueue: [oldTask, task], students: [] }, [{
    studentId: task.studentId, sessionDate: task.taskDate, status: 'synced', tasks: [{ taskId: oldTask.id, planId: task.planId, taskType: 'review', synced: true, result: { ok: true } }],
  }]);
  assert.deepEqual(result.tasks.map(t => t.id), [task.id]);
});

test('a new review cannot be sent using the original review range', () => {
  const target = { source: { id: 1036969, date: task.taskDate, surah_from: 58, verse_from: 1, surah_to: 59, verse_to: 9 }, studentExternalId: '1', planExternalId: '2', attemptIds: [3] };
  const args = [[{ ...task, id: 3 }], { nazemStudentId: '1' }, { nazemPlanId: '2' }];
  assert.equal(validateRecitationTarget(target, ...args).id, 1036969);
  assert.throws(() => validateRecitationTarget({ ...target, source: { ...target.source, id: 1032060, verse_to: 12 } }, ...args), { code: 'NAZEM_SUBMISSION_IDENTITY_CHANGED' });
});

