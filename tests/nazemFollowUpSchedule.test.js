import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nazemFollowUpSlot } from '../server/services/nazemFollowUpSchedule.js';

test('Nazem amount refresh uses 4 AM and 3 PM Riyadh slots, with delayed startup catch-up', () => {
  const slot = iso => nazemFollowUpSlot(new Date(iso));
  assert.equal(slot('2026-09-09T00:59:59Z'), null);
  assert.deepEqual(slot('2026-09-09T01:00:00Z'), { date: '2026-09-09', hour: 4 });
  assert.deepEqual(slot('2026-09-09T11:59:59Z'), { date: '2026-09-09', hour: 4 });
  assert.deepEqual(slot('2026-09-09T12:00:00Z'), { date: '2026-09-09', hour: 15 });
  assert.deepEqual(slot('2026-09-09T15:00:00Z'), { date: '2026-09-09', hour: 15 });
  assert.equal(slot('2026-09-09T21:00:00Z'), null);
  assert.deepEqual(slot('2026-09-10T01:00:00Z'), { date: '2026-09-10', hour: 4 });
});

test('opening evaluation and quarter-hour recitation recovery do not refresh all amounts', () => {
  const server = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../server/workers/nazemSyncWorker.js', import.meta.url), 'utf8');
  assert.doesNotMatch(server, /enqueueNazemFollowUpRefresh/);
  const recovery = worker.slice(worker.indexOf('async function recoverTenantRecitations'), worker.indexOf('async function reconcileTenantDay'));
  assert.doesNotMatch(recovery, /enqueueNazemFollowUpRefresh/);
});
