import assert from 'node:assert/strict';
import console from 'node:console';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { up, down } from '../server/migrations/2026.09.28.1-station-points.js';
import { saveStationPointsBatch } from '../server/services/stationPoints.js';
import { applyStudentPointDelta, logStudentPointTransaction } from '../server/services/studentPoints.js';

// Dedicated loopback-only test instance; never load application credentials.
const pool = mysql.createPool({ host: '127.0.0.1', port: 13329, user: 'root', connectionLimit: 4 });
const database = `station_test_${crypto.randomBytes(6).toString('hex')}`;
const settings = { summitEnabled: true, pointsSystemEnabled: true, studentPointsAddToFamily: true,
  summitMapConfig: { activeStationId: 'station-a', stations: [{ id: 'station-a', name: 'محطة اختبار', kilometer: 0, rewardPoints: 80 }] } };
const connection = await pool.getConnection();
try {
  await connection.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`);
  await connection.query(`USE \`${database}\``);
  await connection.query('CREATE TABLE students (id BIGINT UNSIGNED PRIMARY KEY, points INT NOT NULL, store_balance INT NOT NULL, committee_id BIGINT UNSIGNED) ENGINE=InnoDB');
  await connection.query('CREATE TABLE committees (id BIGINT UNSIGNED PRIMARY KEY, points INT NOT NULL, student_points_contribution INT NOT NULL) ENGINE=InnoDB');
  await connection.query('CREATE TABLE supervisor_committees (supervisor_id BIGINT UNSIGNED, committee_id BIGINT UNSIGNED) ENGINE=InnoDB');
  await connection.query(`CREATE TABLE student_point_transactions (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, student_id BIGINT UNSIGNED,
    supervisor_id BIGINT UNSIGNED, actor_role VARCHAR(40), actor_name VARCHAR(180), transaction_type VARCHAR(20), points INT,
    reason VARCHAR(500), transaction_date DATE, source_type VARCHAR(40), source_id BIGINT UNSIGNED, dedupe_key VARCHAR(190) UNIQUE) ENGINE=InnoDB`);
  await connection.query('INSERT INTO students VALUES (1,0,0,3),(2,0,0,4)');
  await connection.query('INSERT INTO committees VALUES (3,0,0),(4,0,0)');
  await connection.query('INSERT INTO supervisor_committees VALUES (7,3)');
  await up(connection);
  await up(connection);
  const save = async (grades, stationId = 'station-a') => {
    const c = await pool.getConnection();
    try {
      await c.query(`USE \`${database}\``);
      await c.beginTransaction();
      const result = await saveStationPointsBatch(c, { grades, stationId, settings, actor: { role: 'supervisor', id: 7, name: 'معلم اختبار' }, date: '2026-09-28' }, { applyStudentPointDelta, logStudentPointTransaction });
      await c.commit();
      return result;
    } catch (error) { await c.rollback(); throw error; }
    finally { c.release(); }
  };
  await Promise.all([save([{ studentId: 1, points: 80 }]), save([{ studentId: 1, points: 80 }])]);
  assert.equal((await connection.query('SELECT COUNT(*) n FROM student_point_transactions'))[0][0].n, 1);
  await save([{ studentId: 1, points: 30 }]);
  await assert.rejects(async () => {
    await save([{ studentId: 1, points: 50 }, { studentId: 2, points: 40 }]);
  }, { statusCode: 403 });
  const [[student]] = await connection.query('SELECT points, store_balance FROM students WHERE id=1');
  assert.deepEqual(student, { points: 30, store_balance: 30 });
  const [[family]] = await connection.query('SELECT points, student_points_contribution FROM committees WHERE id=3');
  assert.deepEqual(family, { points: 30, student_points_contribution: 30 });
  const [[award]] = await connection.query('SELECT earned_points FROM student_station_points WHERE student_id=1');
  assert.equal(award.earned_points, 30);
  const [[ledger]] = await connection.query("SELECT SUM(CASE WHEN transaction_type='increase' THEN points ELSE -points END) total, COUNT(*) n FROM student_point_transactions");
  assert.equal(Number(ledger.total), 30);
  assert.equal(ledger.n, 2);
  await assert.rejects(down(connection), /Cannot remove recorded/);
  await save([{ studentId: 1, points: 0 }]);
  assert.equal((await connection.query('SELECT points FROM students WHERE id=1'))[0][0].points, 0);
  console.log('PASS: migration, concurrent retries, corrections, ledger/store/family balances, scope rollback and safe migration rollback');
} finally {
  await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
  connection.release();
  await pool.end();
}
