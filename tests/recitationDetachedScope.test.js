import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { managedRecitationIdentitySql } from '../server/services/recitationSessionScope.js';

test('historical Nazem plan links cannot suppress local compensations after disconnecting', t => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE student_quran_tasks(id INTEGER, plan_id INTEGER, student_id INTEGER, task_date TEXT);
    CREATE TABLE nazem_plan_links(ruwasi_plan_id INTEGER, ruwasi_student_id INTEGER, teacher_id INTEGER, sync_status TEXT);
    CREATE TABLE nazem_accounts(teacher_id INTEGER, status TEXT);
    CREATE TABLE app_settings(setting_key TEXT, setting_value TEXT);
    INSERT INTO student_quran_tasks VALUES(1, 4, 7, '2026-10-13'), (2, 4, 7, '2026-10-14');
    INSERT INTO nazem_plan_links VALUES(4, 7, 3, 'synced');
    INSERT INTO nazem_accounts VALUES(3, 'connected');
    INSERT INTO app_settings VALUES('nazemIntegrationEnabled', 'false');`);
  const visible = db.prepare(`SELECT t.id FROM student_quran_tasks t WHERE NOT EXISTS (
    SELECT 1 FROM student_quran_tasks newer WHERE newer.plan_id=t.plan_id
      AND newer.task_date>t.task_date AND ${managedRecitationIdentitySql('t')}) ORDER BY t.id`);
  assert.deepEqual(visible.all().map(row => row.id), [1, 2]);
  db.exec("UPDATE app_settings SET setting_value='true'");
  assert.deepEqual(visible.all().map(row => row.id), [2]);
  for (const status of ['blocked', 'disconnected']) {
    db.prepare('UPDATE nazem_accounts SET status=?').run(status);
    assert.deepEqual(visible.all().map(row => row.id), [1, 2]);
  }
  db.exec("UPDATE nazem_accounts SET status='connected'; UPDATE nazem_plan_links SET sync_status='detached'");
  assert.deepEqual(visible.all().map(row => row.id), [1, 2]);
  assert.throws(() => managedRecitationIdentitySql('t; DROP TABLE students'));
});
