import assert from 'node:assert/strict';
import console from 'node:console';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { requireRecordedNazemLink, wakeNazemMemorizationAfterLink } from '../server/integrations/nazem/pairedRecitation.js';

const connection = await mysql.createConnection({ host: '127.0.0.1', port: 13329, user: 'root' });
const database = `nazem_pair_test_${crypto.randomBytes(6).toString('hex')}`;
try {
  await connection.query(`CREATE DATABASE \`${database}\``);
  await connection.query(`USE \`${database}\``);
  await connection.query(`CREATE TABLE student_quran_tasks (id INT PRIMARY KEY, plan_id INT, student_id INT,
    task_date DATE, task_type VARCHAR(30), track VARCHAR(30), actual_link_count INT NULL)`);
  await connection.query('CREATE TABLE student_quran_recitation_attempts (id INT PRIMARY KEY, task_id INT, is_official BOOLEAN)');
  await connection.query(`CREATE TABLE nazem_sync_jobs (id INT PRIMARY KEY, teacher_id INT, student_id INT,
    operation_type VARCHAR(40), status VARCHAR(30), last_error_code VARCHAR(90), last_error TEXT,
    max_attempts INT, attempt_count INT, next_attempt_at DATETIME(3), payload_json JSON)`);
  const task = { planId: 3, studentId: 4, taskDate: '2026-09-29' };
  await connection.query("INSERT INTO student_quran_tasks VALUES (1,3,4,'2026-09-29','link','memorization',NULL),(2,3,4,'2026-09-29','link','memorization',NULL)");
  for (const [id, teacher, student, date] of [[1,5,4,'2026-09-29'],[2,6,4,'2026-09-29'],[3,5,7,'2026-09-29'],[4,5,4,'2026-09-28']]) {
    await connection.query(`INSERT INTO nazem_sync_jobs VALUES (?, ?, ?, 'recitation.submit', 'blocked',
      'NAZEM_MEMORIZATION_WAITING_FOR_LINK', 'waiting', 2, 2, NOW(3), ?)`,
    [id, teacher, student, JSON.stringify({ planId: 3, taskDate: date, taskType: 'memorization' })]);
  }
  const mapped = { taskType: 'memorization', remoteType: 'conserve' };
  await assert.rejects(requireRecordedNazemLink(connection, task, mapped, { payload: {} }), { code: 'NAZEM_MEMORIZATION_WAITING_FOR_LINK' });
  await wakeNazemMemorizationAfterLink(connection, task, 5);
  assert.equal((await connection.query("SELECT id FROM nazem_sync_jobs WHERE status = 'pending'"))[0].length, 0);
  await connection.beginTransaction();
  await connection.query('UPDATE student_quran_tasks SET actual_link_count = IF(id = 1, 7, 0)');
  await connection.query('INSERT INTO student_quran_recitation_attempts VALUES (1,1,1),(2,2,1)');
  await wakeNazemMemorizationAfterLink(connection, task, 5);
  await connection.rollback();
  assert.equal((await connection.query("SELECT id FROM nazem_sync_jobs WHERE status = 'pending'"))[0].length, 0);
  await connection.beginTransaction();
  await connection.query('UPDATE student_quran_tasks SET actual_link_count = IF(id = 1, 7, 0)');
  await connection.query('INSERT INTO student_quran_recitation_attempts VALUES (1,1,1),(2,2,1)');
  await wakeNazemMemorizationAfterLink(connection, task, 5);
  await connection.commit();
  await requireRecordedNazemLink(connection, task, mapped, { payload: {} });
  assert.equal(mapped.linkCount, 7);
  assert.deepEqual((await connection.query("SELECT id FROM nazem_sync_jobs WHERE status = 'pending'"))[0].map(row => row.id), [1]);
  await connection.query("UPDATE nazem_sync_jobs SET status = 'blocked', last_error_code = 'NAZEM_MEMORIZATION_WAITING_FOR_LINK' WHERE id = 1");
  await connection.query('UPDATE student_quran_tasks SET actual_link_count = 0');
  await wakeNazemMemorizationAfterLink(connection, task, 5);
  await requireRecordedNazemLink(connection, task, mapped, { payload: {} });
  assert.equal(mapped.linkCount, 0);
  console.log('MySQL: dependency, complete group, zero result, scoped wake and rollback passed');
} finally {
  await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
  await connection.end();
}
