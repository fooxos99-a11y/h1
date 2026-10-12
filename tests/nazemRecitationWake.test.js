import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { latestRecitationJobSql } from '../server/integrations/nazem/recitationQueueRecovery.js';

test('successful memorization wakes the latest blocked link, ignoring superseded pending attempts', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.function('JSON_UNQUOTE', value => value);
    database.function('NOW', { varargs: true }, () => '2026-10-04 16:32:12');
    database.function('GREATEST', { varargs: true }, (...values) => Math.max(...values));
    database.exec(`CREATE TABLE nazem_sync_jobs(id INTEGER, teacher_id INTEGER, student_id INTEGER,
      operation_type TEXT, entity_type TEXT, entity_id INTEGER, status TEXT, last_error_code TEXT,
      payload_json TEXT, max_attempts INTEGER, attempt_count INTEGER, next_attempt_at TEXT,
      lease_owner TEXT, lease_expires_at TEXT, last_heartbeat_at TEXT)`);
    const insert = database.prepare(`INSERT INTO nazem_sync_jobs VALUES(?,11,157,'recitation.submit',
      'recitation_day',?,?,'NAZEM_LINK_WAITING_FOR_MEMORIZATION',?,2,1,NULL,NULL,NULL,NULL)`);
    const payload = JSON.stringify({ taskDate: '2026-09-30', taskType: 'link' });
    insert.run(28042, 1592305, 'blocked', payload);
    insert.run(28832, 1592305, 'blocked', payload);
    insert.run(28837, 1613949, 'blocked', JSON.stringify({ taskDate: '2026-10-04', taskType: 'link' }));
    const source = readFileSync(new URL('../server/integrations/nazem/service.js', import.meta.url), 'utf8');
    const start = source.indexOf('async function wakeNextBlockedNazemRecitation(');
    const end = source.indexOf('async function syncAttendance(', start);
    const wake = new Function('reconcileConfirmedRecitationJobs', 'latestRecitationJobSql', `${source.slice(start, end)}; return wakeNextBlockedNazemRecitation;`)(async () => {}, latestRecitationJobSql);
    const connection = { query: async (sql, values) => {
      const statement = database.prepare(sql);
      return sql.trim().startsWith('SELECT') ? [statement.all(...values)] : [{ affectedRows: statement.run(...values).changes }];
    } };
    assert.equal(await wake(connection, { teacherId: 11, studentId: 157, id: 28842 }), 28832);
    database.exec("UPDATE nazem_sync_jobs SET status='pending' WHERE id=28042; UPDATE nazem_sync_jobs SET status='blocked' WHERE id=28832");
    assert.equal(await wake(connection, { teacherId: 11, studentId: 157, id: 28842 }), 28832);
    assert.equal(await wake(connection, { teacherId: 11, studentId: 157, id: 28842 }), null);
    database.exec("UPDATE nazem_sync_jobs SET status='synced' WHERE id=28832");
    assert.equal(await wake(connection, { teacherId: 11, studentId: 157, id: 28832 }), 28837);
    assert.equal(database.prepare('SELECT status FROM nazem_sync_jobs WHERE id=28042').get().status, 'pending');
    assert.equal(await wake(connection, { teacherId: 12, studentId: 157, id: 99999 }), null);
    assert.equal(await wake(connection, { teacherId: 11, studentId: 20, id: 99999 }), null);
  } finally { database.close(); }
});

test('a waiting link wakes only an evaluated memorization dependency, never another waiting link', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.function('JSON_UNQUOTE', value => value == null ? null : String(value));
    database.function('NOW', { varargs: true }, () => '2026-10-05 01:00:00');
    database.function('GREATEST', { varargs: true }, (...values) => Math.max(...values));
    database.exec(`CREATE TABLE nazem_sync_jobs(id INTEGER, teacher_id INTEGER, student_id INTEGER,
      operation_type TEXT, entity_type TEXT, entity_id INTEGER, status TEXT, last_error_code TEXT,
      payload_json TEXT, max_attempts INTEGER, attempt_count INTEGER, next_attempt_at TEXT,
      lease_owner TEXT, lease_expires_at TEXT, last_heartbeat_at TEXT)`);
    const insert = database.prepare(`INSERT INTO nazem_sync_jobs VALUES(?,15,86,'recitation.submit',
      'recitation_day',?,? ,?, ?,2,1,NULL,NULL,NULL,NULL)`);
    const payload = (taskType, taskDate, planId = 59) => JSON.stringify({ taskType, taskDate, planId });
    insert.run(28299, 1598427, 'blocked', 'NAZEM_LINK_WAITING_FOR_MEMORIZATION', payload('link', '2026-10-01'));
    insert.run(28868, 1610000, 'blocked', 'NAZEM_LINK_WAITING_FOR_MEMORIZATION', payload('link', '2026-10-04'));
    const source = readFileSync(new URL('../server/integrations/nazem/service.js', import.meta.url), 'utf8');
    const start = source.indexOf('async function wakeNextBlockedNazemRecitation(');
    const end = source.indexOf('async function syncAttendance(', start);
    const wake = new Function('reconcileConfirmedRecitationJobs', 'latestRecitationJobSql', `${source.slice(start, end)}; return wakeNextBlockedNazemRecitation;`)(async () => {}, latestRecitationJobSql);
    const connection = { query: async (sql, values) => {
      const statement = database.prepare(sql);
      return sql.trim().startsWith('SELECT') ? [statement.all(...values)] : [{ affectedRows: statement.run(...values).changes }];
    } };
    const waiting = { teacherId: 15, studentId: 86, id: 28868, payload: { planId: 59, taskDate: '2026-10-04' } };
    for (let repeat = 0; repeat < 4; repeat++) {
      assert.equal(await wake(connection, waiting, { dependencyOnly: true }), null);
    }
    assert.deepEqual(database.prepare('SELECT status,max_attempts FROM nazem_sync_jobs').all().map(row => [row.status, row.max_attempts]), [['blocked', 2], ['blocked', 2]]);
    insert.run(29000, 1700000, 'blocked', 'NAZEM_PREVIOUS_DAYS_BLOCKING', payload('memorization', '2026-10-01', 60));
    insert.run(29001, 1700001, 'blocked', 'NAZEM_PREVIOUS_DAYS_BLOCKING', payload('memorization', '2026-10-05'));
    assert.equal(await wake(connection, waiting, { dependencyOnly: true }), null);
    insert.run(29002, 1700002, 'blocked', 'NAZEM_PREVIOUS_DAYS_BLOCKING', payload('memorization', '2026-10-01'));
    database.exec("UPDATE nazem_sync_jobs SET status='pending' WHERE id=28299");
    assert.equal(await wake(connection, { ...waiting, payload: undefined }, { dependencyOnly: true }), null);
    assert.equal(await wake(connection, waiting, { dependencyOnly: true }), 29002);
    assert.equal(await wake(connection, waiting, { dependencyOnly: true }), null);
    assert.equal(database.prepare('SELECT status FROM nazem_sync_jobs WHERE id=29000').get().status, 'blocked');
    assert.equal(database.prepare('SELECT status FROM nazem_sync_jobs WHERE id=29001').get().status, 'blocked');
    assert.match(source, /cause\?\.code === 'NAZEM_LINK_WAITING_FOR_MEMORIZATION'[\s\S]*?dependencyOnly: true/);
  } finally { database.close(); }
});

