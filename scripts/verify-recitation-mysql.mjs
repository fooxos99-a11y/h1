import process from 'node:process';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { setQuranTaskGroupReward } from '../server/services/quranTaskRewards.js';

// No application environment loader: production credentials are never reused.
const host = process.env.RECITATION_TEST_MYSQL_HOST || '127.0.0.1';
const user = process.env.RECITATION_TEST_MYSQL_USER;
if (!user) {
  process.stderr.write('لم يُنفذ اختبار MySQL: يلزم حساب اختبار محلي في RECITATION_TEST_MYSQL_USER، ولا تستخدم حساب الإنتاج.\n');
  process.exitCode = 2;
} else {
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(host), 'Only an explicitly configured local test server is supported');
  const database = `recitation_test_${crypto.randomBytes(8).toString('hex')}`;
  assert.match(database, /^recitation_test_[a-f0-9]{16}$/);
  const pool = mysql.createPool({ host, port: Number(process.env.RECITATION_TEST_MYSQL_PORT || 3306), user,
    password: process.env.RECITATION_TEST_MYSQL_PASSWORD || '', connectionLimit: 3 });
  let created = false;
  const run = async (callback) => {
    const connection = await pool.getConnection();
    try {
      await connection.query(`USE \`${database}\``);
      await connection.beginTransaction();
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  };
  try {
    await pool.query(`CREATE DATABASE \`${database}\``);
    created = true;
    await run(async (connection) => {
      await connection.query('CREATE TABLE students (id BIGINT PRIMARY KEY, points INT NOT NULL, store_balance INT NOT NULL, committee_id BIGINT NULL) ENGINE=InnoDB');
      await connection.query('CREATE TABLE student_quran_tasks (id BIGINT PRIMARY KEY, points INT NOT NULL) ENGINE=InnoDB');
      await connection.query(`CREATE TABLE student_point_transactions (id BIGINT AUTO_INCREMENT PRIMARY KEY,
        student_id BIGINT, supervisor_id BIGINT NULL, actor_role VARCHAR(40), actor_name VARCHAR(100),
        transaction_type VARCHAR(20), points INT, reason VARCHAR(200), transaction_date DATE,
        source_type VARCHAR(40), source_id BIGINT, dedupe_key VARCHAR(190) UNIQUE) ENGINE=InnoDB`);
      await connection.query('INSERT INTO students VALUES (1, 0, 0, NULL)');
      await connection.query('INSERT INTO student_quran_tasks VALUES (1, 0), (2, 0)');
    });
    const reward = (id, points) => run((connection) => setQuranTaskGroupReward(connection, {
      taskIds: [id], studentId: 1, targetPoints: points,
      settings: { maxDailyStudentPoints: 78, studentPointsAddToFamily: false }, date: '2026-09-08',
      sourceType: 'quran_evaluation', dedupeKey: `test:${id}`, actorRole: 'system', actorName: 'test', reason: 'test',
    }));
    const outcomes = await Promise.allSettled([reward(1, 40), reward(2, 40)]);
    assert.equal(outcomes.filter((row) => row.status === 'fulfilled').length, 1);
    assert.equal(outcomes.find((row) => row.status === 'rejected').reason.statusCode, 422);
    const winningId = outcomes[0].status === 'fulfilled' ? 1 : 2;
    await Promise.all([reward(winningId, 40), reward(winningId, 40)]);
    await run(async (connection) => {
      const [[balance]] = await connection.query('SELECT points, store_balance AS storeBalance FROM students WHERE id = 1');
      assert.deepEqual(balance, { points: 40, storeBalance: 40 });
      const [[ledger]] = await connection.query('SELECT COUNT(*) AS count, SUM(points) AS points FROM student_point_transactions');
      assert.equal(Number(ledger.count), 1); assert.equal(Number(ledger.points), 40);
    });
    const losingId = winningId === 1 ? 2 : 1;
    await run((connection) => connection.query('UPDATE student_quran_tasks SET points = 20 WHERE id = ?', [losingId]));
    await assert.rejects(reward(losingId, 20), { statusCode: 409 });
    await assert.rejects(run(async (connection) => {
      await connection.query('UPDATE students SET points = 0 WHERE id = 1');
      throw new Error('injected rollback');
    }), /injected rollback/);
    await run(async (connection) => {
      const [[balance]] = await connection.query('SELECT points FROM students WHERE id = 1');
      assert.equal(balance.points, 40);
    });
    process.stdout.write('MySQL: concurrent daily cap, repeated requests, ledger drift and rollback passed in a disposable local schema.\n');
  } finally {
    // The generated name is validated above; only this run's newly created schema is removed.
    if (created) await pool.query(`DROP DATABASE \`${database}\``);
    await pool.end();
  }
}
