import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { latestRecitationRetryJoinSql } from '../server/services/recitationRetryScope.js';

// Dedicated local instance only. No application environment or production secrets.
const database = `startup_retry_test_${crypto.randomBytes(6).toString('hex')}`;
const db = await mysql.createConnection({ host: '127.0.0.1', port: 33320, user: 'root' });
try {
  await db.query(`CREATE DATABASE \`${database}\``);
  await db.query(`USE \`${database}\``);
  await db.query('CREATE TABLE students (id INT PRIMARY KEY, committee_id INT)');
  await db.query('CREATE TABLE supervisor_committees (supervisor_id INT, committee_id INT)');
  await db.query(`CREATE TABLE student_quran_tasks (id INT PRIMARY KEY, student_id INT, plan_id INT,
    task_type VARCHAR(30), track VARCHAR(30), task_date DATE, late INT,
    from_page INT, to_page INT, from_surah INT, from_ayah INT, to_surah INT, to_ayah INT,
    INDEX student_lookup(student_id), INDEX plan_lookup(plan_id,task_date,task_type))`);
  await db.query(`CREATE TABLE student_quran_recitation_attempts (id INT PRIMARY KEY, task_id INT,
    session_date DATE, is_official INT, teacher_completed INT, INDEX task_lookup(task_id))`);
  await db.query('INSERT INTO students VALUES (1,10),(2,10),(3,20)');
  await db.query('INSERT INTO supervisor_committees VALUES (100,10),(200,20)');
  for (const [id, studentId, planId, date, late] of [[11,1,1,'2026-10-17',0],[12,1,1,'2026-10-18',0],
    [13,1,1,'2026-10-19',1],[21,2,2,'2026-10-18',1],[31,3,3,'2026-10-18',0]]) {
    await db.query('INSERT INTO student_quran_tasks VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [id, studentId, planId, 'memorization', 'memorization', date, late, 5, 5, 2, 1, 2, 3]);
  }
  await db.query(`INSERT INTO student_quran_recitation_attempts VALUES
    (1,11,'2026-10-17',1,0),(2,12,'2026-10-18',1,0),(3,12,'2026-10-18',1,0),
    (4,13,'2026-10-19',0,1),(5,21,'2026-10-18',1,1),(6,31,'2026-10-19',1,1)`);
  const original = `SELECT t.id, EXISTS (SELECT 1 FROM student_quran_recitation_attempts a
    WHERE a.task_id=t.id AND a.is_official=1 AND a.session_date=(
      SELECT MAX(b.session_date) FROM student_quran_recitation_attempts b
      JOIN student_quran_tasks task ON task.id=b.task_id WHERE task.student_id=t.student_id AND b.is_official=1)) AS retryable
    FROM student_quran_tasks t JOIN students s ON s.id=t.student_id
    JOIN supervisor_committees sc ON sc.committee_id=s.committee_id AND sc.supervisor_id=? ORDER BY t.id`;
  const optimized = `SELECT t.id, retryable_session.task_id IS NOT NULL AS retryable
    FROM student_quran_tasks t JOIN students s ON s.id=t.student_id
    JOIN supervisor_committees sc ON sc.committee_id=s.committee_id AND sc.supervisor_id=?
    ${latestRecitationRetryJoinSql} ORDER BY t.id`;
  for (const teacher of [100, 200, 300]) {
    assert.deepEqual((await db.query(optimized, [teacher, teacher]))[0], (await db.query(original, [teacher]))[0]);
  }
  assert.deepEqual((await db.query(optimized, [100,100]))[0].map(r => [r.id, r.retryable]), [[11,0],[12,1],[13,0],[21,1]]);
  const matching = `WHERE attempted_task.plan_id=t.plan_id AND attempted_task.task_type=t.task_type
    AND attempted_task.track=t.track AND attempted_task.from_page=t.from_page AND attempted_task.to_page=t.to_page
    AND same_day_attempt.is_official=1 AND same_day_attempt.session_date=?
    AND (t.late=0 OR same_day_attempt.teacher_completed=1)`;
  const slow = `SELECT t.id FROM student_quran_tasks t WHERE NOT EXISTS (SELECT 1
    FROM student_quran_recitation_attempts same_day_attempt
    JOIN student_quran_tasks attempted_task ON attempted_task.id=same_day_attempt.task_id ${matching}) ORDER BY t.id`;
  const fast = `SELECT t.id FROM student_quran_tasks t WHERE NOT EXISTS (SELECT 1
    FROM student_quran_tasks attempted_task STRAIGHT_JOIN student_quran_recitation_attempts same_day_attempt
    ON same_day_attempt.task_id=attempted_task.id ${matching}) ORDER BY t.id`;
  for (const date of ['2026-10-17','2026-10-18','2026-10-19']) assert.deepEqual((await db.query(fast,[date]))[0], (await db.query(slow,[date]))[0]);
  await db.query("INSERT INTO student_quran_recitation_attempts VALUES (7,13,'2026-10-20',1,1)");
  assert.deepEqual((await db.query(optimized, [100,100]))[0].map(r => [r.id,r.retryable]), [[11,0],[12,0],[13,1],[21,1]]);
  globalThis.process.stdout.write('Real MySQL: latest official session, duplicate attempts, nonofficial attempts, scoped ownership, late success and fresh grading matched.\n');
} finally {
  assert.match(database, /^startup_retry_test_[a-f0-9]{12}$/);
  await db.query(`DROP DATABASE IF EXISTS \`${database}\``);
  await db.end();
}
