import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { recoverFailedNazemRecitations, latestRecitationJobSql, dismissSupersededNazemRecitations } from '../server/integrations/nazem/recitationQueueRecovery.js';

test('automatic recovery retains retry limits, confirmed receipts and review errors', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.function('JSON_UNQUOTE', value => value);
    db.function('NOW', { varargs: true }, () => '2026-10-04 17:00:00');
    db.exec(`CREATE TABLE nazem_sync_jobs (id INTEGER,teacher_id INTEGER,student_id INTEGER,
      operation_type TEXT,entity_type TEXT,entity_id INTEGER,status TEXT,attempt_count INTEGER,max_attempts INTEGER,
      last_error_code TEXT,payload_json TEXT,updated_at TEXT,next_attempt_at TEXT,lease_owner TEXT,lease_expires_at TEXT,
      last_succeeded_at TEXT);
      CREATE TABLE nazem_recitation_links (teacher_id INTEGER,sync_status TEXT,last_synced_at TEXT,ruwasi_recitation_id INTEGER)`);
    const insert = db.prepare(`INSERT INTO nazem_sync_jobs VALUES(?,11,157,'recitation.submit','recitation_day',?,
      'failed',?,2,?,?,'2026-10-04 16:00:00',NULL,NULL,NULL,NULL)`);
    for (const [id, entity, attempts, code] of [[1,1,1,'NAZEM_RECITATION_TIMEOUT'],[2,2,2,'NAZEM_RECITATION_TIMEOUT'],
      [3,3,1,'NAZEM_RECITATION_TIMEOUT'],[4,4,1,'NAZEM_SAVED_TARGET_CHANGED'],[5,5,1,'NAZEM_RECITATION_TIMEOUT'],[6,5,1,'NAZEM_RECITATION_TIMEOUT']]) {
      insert.run(id, entity, attempts, code, JSON.stringify({ attemptId: id }));
    }
    db.exec("INSERT INTO nazem_recitation_links VALUES(11,'synced','2026-10-04 16:30:00',3)");
    const connection = { query: async (sql, values) => {
      assert.doesNotMatch(sql, /SET[\s\S]*attempt_count\s*=/);
      assert.doesNotMatch(sql, /UPDATE nazem_(?:recitation|daily_follow_up)_links/);
      // SQLite lacks MySQL's UPDATE JOIN syntax; execute its unchanged joins/eligibility first.
      const join = sql.slice(sql.indexOf('LEFT JOIN'), sql.indexOf('SET job.status'));
      const where = sql.slice(sql.indexOf('WHERE job.operation_type'))
        .replace(/DATE_SUB\(NOW\(3\), INTERVAL \? MINUTE\)/, '?');
      const ids = db.prepare(`SELECT job.id FROM nazem_sync_jobs job ${join} ${where}`)
        .all(...values.map(() => '2026-10-04 16:45:00'));
      for (const { id } of ids) db.prepare(`UPDATE nazem_sync_jobs SET status='retrying',
        max_attempts=MAX(max_attempts,attempt_count+CASE WHEN EXISTS (
          SELECT 1 FROM nazem_sync_jobs healthy WHERE healthy.teacher_id=nazem_sync_jobs.teacher_id
            AND healthy.status='synced' AND healthy.last_succeeded_at>nazem_sync_jobs.updated_at
        ) THEN 2 ELSE 0 END),updated_at='2026-10-04 17:00:00' WHERE id=?`).run(id);
      return [{ affectedRows: ids.length }];
    } };
    assert.equal(await recoverFailedNazemRecitations(connection, 15), 2);
    assert.deepEqual(db.prepare("SELECT id FROM nazem_sync_jobs WHERE status='retrying' ORDER BY id").all().map(row=>row.id), [1,6]);
    assert.equal(await recoverFailedNazemRecitations(connection, 15), 0);
    assert.equal(db.prepare('SELECT attempt_count FROM nazem_sync_jobs WHERE id=1').get().attempt_count, 1);
    assert.equal(db.prepare('SELECT sync_status FROM nazem_recitation_links').get().sync_status, 'synced');
    db.exec(`INSERT INTO nazem_sync_jobs VALUES(7,12,157,'followup.refresh','account',12,'synced',1,2,
      NULL,'{}','2026-10-04 16:50:00',NULL,NULL,NULL,'2026-10-04 16:50:00')`);
    assert.equal(await recoverFailedNazemRecitations(connection, 15), 0, 'another teacher cannot renew this budget');
    db.exec('UPDATE nazem_sync_jobs SET teacher_id=11 WHERE id=7');
    assert.equal(await recoverFailedNazemRecitations(connection, 15), 1);
    assert.equal(db.prepare('SELECT attempt_count FROM nazem_sync_jobs WHERE id=2').get().attempt_count, 2);
    assert.equal(db.prepare('SELECT max_attempts FROM nazem_sync_jobs WHERE id=2').get().max_attempts, 4);
    assert.equal(db.prepare('SELECT status FROM nazem_sync_jobs WHERE id=3').get().status, 'failed', 'receipt remains final');
    assert.equal(db.prepare('SELECT status FROM nazem_sync_jobs WHERE id=4').get().status, 'failed', 'review errors remain final');
    db.exec("UPDATE nazem_sync_jobs SET status='failed',attempt_count=4 WHERE id=2");
    assert.equal(await recoverFailedNazemRecitations(connection, 15), 0, 'the same successful connection cannot renew twice');
  } finally { db.close(); }
});

test('superseded recovery retires only unsent operations and preserves evaluations and journals', async () => {
  await dismissSupersededNazemRecitations({ query: async sql => {
    assert.match(sql, /older\.status IN \('pending','retrying','failed','blocked','requires_review','conflict'\)/);
    assert.match(sql, /deliveryWrites/);
    assert.match(sql, /newer\.student_id = older\.student_id/);
    assert.doesNotMatch(sql, /UPDATE student_quran|DELETE|payload_json\s*=/);
    return [{ affectedRows: 7 }];
  } });
  assert.throws(()=>latestRecitationJobSql('job; DELETE'), /Invalid queue alias/);
  const worker = readFileSync(new URL('../server/workers/nazemSyncWorker.js', import.meta.url), 'utf8');
  const recovery = worker.slice(worker.indexOf('async function recoverTenantRecitations'), worker.indexOf('async function reconcileTenantDay'));
  assert.doesNotMatch(recovery, /attempt_count = 0|UPDATE nazem_recitation_links|UPDATE nazem_daily_follow_up_links/);
});
