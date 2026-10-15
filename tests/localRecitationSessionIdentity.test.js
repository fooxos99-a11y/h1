import test from 'node:test';
import assert from 'node:assert/strict';
import { recitationSessionTypeForTask, normalizeRecitationSessionType } from '../shared/offline-recitation.js';
import { DatabaseSync } from 'node:sqlite';
import { resolveLocalSessionIdentity } from '../server/services/recitationLocalSessionIdentity.js';

const task = { id: 41, studentId: 7, planId: 3, taskType: 'memorization',
  taskDate: '2026-10-14', track: 'memorization', nazemManaged: false };

test('local daily recitation and each compensation date have independent session slots', () => {
  for (const taskType of ['memorization', 'review']) {
    const today = recitationSessionTypeForTask({ ...task, taskType });
    const yesterday = recitationSessionTypeForTask({ ...task, taskType, taskDate: '2026-10-13' });
    const earlier = recitationSessionTypeForTask({ ...task, taskType, taskDate: '2026-10-12' });
    assert.equal(new Set([today, yesterday, earlier]).size, 3);
    assert.equal(recitationSessionTypeForTask({ ...task, id: 42, taskType }), today,
      'Split passages of the same lesson still share one slot');
  }
});

test('a replacement local plan may continue the next passage without occupying the accepted old plan slot', () => {
  const old = recitationSessionTypeForTask(task);
  const replacement = recitationSessionTypeForTask({ ...task, planId: 4 });
  assert.notEqual(replacement, old);
});

test('local plan keys remain valid and keep mastery independent', () => {
  assert.equal(recitationSessionTypeForTask(task), 'memorization:2026-10-14:p3');
  assert.equal(normalizeRecitationSessionType(recitationSessionTypeForTask(task)), recitationSessionTypeForTask(task));
  assert.notEqual(recitationSessionTypeForTask(task), recitationSessionTypeForTask({ ...task, track: 'mastery' }));
});

test('legacy daily slots protect their recorded date without blocking another compensation', async t => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.function('CONCAT', { varargs: true }, (...values) => values.join(''));
  db.exec(`CREATE TABLE student_quran_recitation_daily_slots(student_id INTEGER, session_date TEXT, session_type TEXT, session_id TEXT);
    CREATE TABLE student_quran_tasks(id INTEGER, task_date TEXT, task_type TEXT, track TEXT, plan_id INTEGER);
    CREATE TABLE student_quran_recitation_session_parts(session_id TEXT, task_id INTEGER, status TEXT);
    CREATE TABLE student_quran_recitation_attempts(session_id TEXT, task_id INTEGER, is_official INTEGER, request_id TEXT);
    INSERT INTO student_quran_tasks VALUES(40, '2026-10-13', 'memorization', 'memorization', 3);
    INSERT INTO student_quran_recitation_daily_slots VALUES(7, '2026-10-14', 'memorization', 'old');
    INSERT INTO student_quran_recitation_session_parts VALUES('old', 40, 'accepted');`);
  const connection = { query: async (sql, args) => [db.prepare(sql.replace('FOR UPDATE', '')).all(...args)] };
  const identity = value => resolveLocalSessionIdentity(connection, value, task.taskDate, recitationSessionTypeForTask(value));
  assert.equal(await identity(task), 'memorization:2026-10-14:p3');
  assert.equal(await identity({ ...task, id: 40, taskDate: '2026-10-13' }), 'memorization');
  assert.equal(await identity({ ...task, taskDate: '2026-10-12' }), 'memorization:2026-10-12:p3');
  assert.equal(await identity({ ...task, taskDate: '2026-10-13', planId: 4 }), 'memorization:2026-10-13:p4');
  db.exec(`DELETE FROM student_quran_recitation_session_parts;
    INSERT INTO student_quran_recitation_attempts VALUES(NULL, 40, 1, 'old:40');`);
  assert.equal(await identity({ ...task, id: 40, taskDate: '2026-10-13' }), 'memorization');
  db.exec('UPDATE student_quran_recitation_attempts SET is_official=0');
  assert.equal(await identity({ ...task, id: 40, taskDate: '2026-10-13' }), 'memorization:2026-10-13:p3');
  db.exec(`INSERT INTO student_quran_tasks VALUES(42, '2026-10-14', 'review', 'memorization', 3);
    INSERT INTO student_quran_recitation_daily_slots VALUES(7, '2026-10-14', 'review:2026-10-14:p3', 'local-review');
    INSERT INTO student_quran_recitation_session_parts VALUES('local-review', 42, 'accepted');`);
  const connectedReview = { ...task, id: 42, taskType: 'review', nazemManaged: true };
  assert.equal(await identity(connectedReview), 'review:2026-10-14:p3', 'Reconnecting preserves the exact accepted local review');
  assert.equal(await identity({ ...connectedReview, id: 43 }), 'review:2026-10-14:43', 'A genuinely new Nazem review keeps its separate identity');
});

test('a review accepted while connected stays protected after detaching Nazem', async () => {
  const review = { ...task, taskType: 'review' };
  const connection = { query: async (_sql, args) => {
    assert.equal(args[4], 'review:2026-10-14:%');
    assert.equal(args[8], task.planId);
    return [[{ sessionType: 'review:2026-10-14:41' }]];
  } };
  assert.equal(await resolveLocalSessionIdentity(connection, review, task.taskDate,
    recitationSessionTypeForTask(review)), 'review:2026-10-14:41');
});
