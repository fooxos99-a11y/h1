import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmedRecitationJobSql, reconcileConfirmedRecitationJobs } from '../server/integrations/nazem/confirmedRecitationJobs.js';
import { retryEligibilitySql } from '../server/routes/teacherRecitationRetries.js';

test('an obsolete recitation delivery requires its exact attempt, tenant teacher and real receipt', () => {
  assert.match(confirmedRecitationJobSql, /\$\.attemptId/);
  assert.match(confirmedRecitationJobSql, /attempt.student_id = job.student_id/);
  assert.match(confirmedRecitationJobSql, /receipt.teacher_id = job.teacher_id/);
  assert.match(confirmedRecitationJobSql, /receipt.last_synced_at IS NOT NULL/);
  assert.match(confirmedRecitationJobSql, /remaining.sync_status <> 'synced'/);
  assert.ok(retryEligibilitySql.includes(`AND NOT (${confirmedRecitationJobSql})`));
  assert.doesNotMatch(retryEligibilitySql, /job.status IN \([^)]*'(?:requires_review|blocked|conflict)'/);
});

test('reconciliation closes only confirmed queue records and preserves grades, points, events and active leases', async () => {
  const queries = [];
  const connection = { query: async (sql, params) => { queries.push({ sql, params }); return [{ affectedRows: 4 }]; } };
  assert.equal(await reconcileConfirmedRecitationJobs(connection, 11), 4);
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].params, [11]);
  assert.match(queries[0].sql, /AND job.teacher_id = \?/);
  assert.match(queries[0].sql, /job.lease_expires_at < NOW\(3\)/);
  assert.match(queries[0].sql, /UPDATE nazem_sync_jobs job/);
  assert.doesNotMatch(queries[0].sql, /DELETE|INSERT|UPDATE students|UPDATE student_quran|UPDATE nazem_recitation_links/);
  assert.ok(queries[0].sql.endsWith(confirmedRecitationJobSql));
});
