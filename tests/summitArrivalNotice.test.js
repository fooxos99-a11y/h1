import test from 'node:test';
import assert from 'node:assert/strict';
import { claimSummitArrival } from '../src/lib/summitArrivalNotice.js';

test('arrival appears once per student and station, including a fresh module after reload', async () => {
  const entries = new Map();
  const storage = { getItem: (key) => entries.get(key), setItem: (key, value) => entries.set(key, value) };
  const stage = { id: 10, points: 0 };
  assert.equal(claimSummitArrival('tenant1:1', stage, storage), true);
  assert.equal(claimSummitArrival('tenant1:1', stage, storage), false);
  const fresh = await import('../src/lib/summitArrivalNotice.js?reload');
  assert.equal(fresh.claimSummitArrival('tenant1:1', stage, storage), false);
  assert.equal(claimSummitArrival('tenant1:2', stage, storage), true);
  assert.equal(claimSummitArrival('tenant2:1', stage, storage), true);
  assert.equal(claimSummitArrival('tenant1:1', { id: 11 }, storage), true);
});
