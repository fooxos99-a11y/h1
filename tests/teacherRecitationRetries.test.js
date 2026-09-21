import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import createRouter, { retryEligibilitySql } from '../server/routes/teacherRecitationRetries.js';
import { formatClockTime } from '../shared/clock-time.js';

test('attendance times use compact 12-hour Arabic labels', () => {
  for (const [input, output] of [['13:00','1م'],['03:00','3ص'],['00:00','12ص'],['12:00','12م'],['23:05:00','11:05م'],[null,'-']]) {
    assert.equal(formatClockTime(input), output);
  }
});

test('retries require 30 minutes, exclude confirmed jobs and active leases', () => {
  assert.match(retryEligibilitySql, />= 1800/);
  assert.match(retryEligibilitySql, /teacherRetryRequestedAt/);
  assert.match(retryEligibilitySql, /job.status IN \('pending','retrying','failed','syncing'\)/);
  assert.match(retryEligibilitySql, /AND NOT \(EXISTS/);
  assert.match(retryEligibilitySql, /receipt.sync_status = 'synced'/);
  assert.match(retryEligibilitySql, /lease_expires_at < NOW/);
});

test('teacher can requeue only their own delivery without a new evaluation or point award', async () => {
  const calls = [];
  const app = express();
  app.use((req, _res, next) => { req.auth = { role: 'supervisor', id: 11 }; next(); });
  app.use('/teachers/:supervisorId/retries', createRouter({ db: () => ({ query: async (sql, params) => {
    calls.push({ sql, params }); return [{ affectedRows: 1 }];
  } }) }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/teachers`;
    assert.equal((await fetch(`${base}/12/retries/7`, { method: 'POST' })).status, 403);
    assert.equal(calls.length, 0);
    assert.equal((await fetch(`${base}/11/retries/7`, { method: 'POST' })).status, 200);
    assert.deepEqual(calls[0].params, ['7', 11]);
    assert.match(calls[0].sql, /UPDATE nazem_sync_jobs/);
    assert.doesNotMatch(calls[0].sql, /INSERT|UPDATE students|student_point_transactions/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
