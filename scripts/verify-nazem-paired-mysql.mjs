import process from 'node:process';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { wakeNazemMemorizationAfterLink } from '../server/integrations/nazem/pairedRecitation.js';

// Explicit test credentials only; every write stays in this run's disposable schema.
const host = process.env.RECITATION_TEST_MYSQL_HOST || '127.0.0.1';
const user = process.env.RECITATION_TEST_MYSQL_USER;
if (!user) {
  process.stderr.write('MySQL regression requires RECITATION_TEST_MYSQL_USER for a local test account.\n');
  process.exitCode = 2;
} else {
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(host), 'Only a local test server is supported');
  const socketPath = process.env.RECITATION_TEST_MYSQL_SOCKET;
  if (socketPath) assert.ok(socketPath.startsWith('/'), 'A test socket must be an absolute local path');
  const database = `recitation_test_${crypto.randomBytes(8).toString('hex')}`;
  assert.match(database, /^recitation_test_[a-f0-9]{16}$/);
  const pool = mysql.createPool({ host, socketPath, port: Number(process.env.RECITATION_TEST_MYSQL_PORT || 3306),
    user, password: process.env.RECITATION_TEST_MYSQL_PASSWORD || '', connectionLimit: 1 });
  let created = false;
  const run = async callback => {
    const connection = await pool.getConnection();
    try {
      await connection.query(`USE \`${database}\``);
      return await callback(connection);
    } finally { connection.release(); }
  };
  try {
    await pool.query(`CREATE DATABASE \`${database}\``);
    created = true;
    await run(async (connection) => {
      await connection.query(`CREATE TABLE student_quran_tasks
        (id BIGINT PRIMARY KEY, plan_id BIGINT, student_id BIGINT, task_date DATE,
         task_type VARCHAR(30), track VARCHAR(30), actual_link_count INT) ENGINE=InnoDB`);
      await connection.query('INSERT INTO student_quran_tasks (id) VALUES (1)');
      await connection.query(`CREATE TABLE student_quran_recitation_attempts
        (task_id BIGINT, is_official INT) ENGINE=InnoDB`);
      await connection.query(`CREATE TABLE nazem_sync_jobs
        (id BIGINT PRIMARY KEY, teacher_id BIGINT, student_id BIGINT, operation_type VARCHAR(40),
         entity_type VARCHAR(40), entity_id BIGINT, status VARCHAR(30), payload_json JSON,
         max_attempts INT, attempt_count INT, next_attempt_at DATETIME(3),
         last_error_code VARCHAR(80), last_error TEXT) ENGINE=InnoDB`);
      await connection.query(`UPDATE student_quran_tasks SET plan_id=2, student_id=3,
        task_date='2026-09-29', task_type='link', track='memorization', actual_link_count=0 WHERE id=1`);
      await connection.query('INSERT INTO student_quran_recitation_attempts VALUES (1,1)');
      const jobs = [
        [1,3,3,100,2,'2026-09-29'], [2,3,3,100,2,'2026-09-29'],
        [3,4,3,101,2,'2026-09-29'], [4,3,4,102,2,'2026-09-29'],
        [5,3,3,103,9,'2026-09-29'], [6,3,3,104,2,'2026-09-28'],
      ];
      for (const [id, teacher, student, entity, planId, taskDate] of jobs) {
        await connection.query(`INSERT INTO nazem_sync_jobs
          VALUES (?, ?, ?, 'recitation.submit', 'recitation_day', ?, 'blocked', ?, 2, 4, NULL,
            'NAZEM_MEMORIZATION_WAITING_FOR_LINK', 'waiting')`,
        [id, teacher, student, entity, JSON.stringify({ planId, taskDate, taskType: 'memorization' })]);
      }
      const task = { planId: 2, studentId: 3, taskDate: '2026-09-29' };
      const [woken] = await wakeNazemMemorizationAfterLink(connection, task, 3);
      assert.equal(woken.affectedRows, 1);
      const [jobsAfter] = await connection.query('SELECT id,status,max_attempts,attempt_count FROM nazem_sync_jobs ORDER BY id');
      assert.deepEqual(jobsAfter.map(row => row.status), ['blocked','pending','blocked','blocked','blocked','blocked']);
      assert.equal(jobsAfter[1].max_attempts, 6);
      assert.equal(jobsAfter[1].attempt_count, 4);
      const [repeated] = await wakeNazemMemorizationAfterLink(connection, task, 3);
      assert.equal(repeated.affectedRows, 0);
      await connection.query('UPDATE nazem_sync_jobs SET status=\'blocked\' WHERE id=2');
      await connection.query('UPDATE student_quran_tasks SET actual_link_count=NULL WHERE id=1');
      const [incomplete] = await wakeNazemMemorizationAfterLink(connection, task, 3);
      assert.equal(incomplete.affectedRows, 0);
    });
    process.stdout.write('MySQL paired recitation: latest job, account/date/plan isolation, zero link, retry budget and incomplete link passed.\n');
  } finally {
    if (created) await pool.query(`DROP DATABASE \`${database}\``);
    await pool.end();
  }
}
