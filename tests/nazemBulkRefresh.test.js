import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshNazemAccounts } from '../src/services/nazemBulkRefresh.js';

test('bulk refresh queues connected teachers once and isolates failures', async () => {
  const calls = [];
  const rows = await refreshNazemAccounts([
    { teacherId: 1, status: 'connected' }, { teacherId: 2, status: 'connected' },
    { teacherId: 1, status: 'connected' }, { teacherId: 3, status: 'failed' },
  ], {
    api: {
      refreshImportData: async (id) => {
        calls.push(id);
        if (id === 1) throw new Error('unavailable');
        return { jobId: 20, status: 'pending' };
      },
      getImportRefreshStatus: async () => ({ status: 'synced', result: { planChanges: [] } }),
    }, onUpdate: () => {}, pause: async () => {},
  });
  assert.deepEqual(calls, [1, 2]);
  assert.deepEqual(rows.map((row) => row.status), ['failed', 'synced']);
  assert.deepEqual(rows[1].result, { planChanges: [] });
});

test('temporary polling errors keep the job pending and recover without enqueueing again', async () => {
  let polls = 0;
  let starts = 0;
  const snapshots = [];
  const rows = await refreshNazemAccounts([{ teacherId: 1, status: 'connected' }], {
    api: {
      refreshImportData: async () => { starts += 1; return { jobId: 10, status: 'pending' }; },
      getImportRefreshStatus: async () => {
        if (++polls === 1) throw new Error('offline');
        return { status: 'synced' };
      },
    }, onUpdate: (next) => snapshots.push(next), pause: async () => {},
  });
  assert.equal(starts, 1);
  assert.equal(polls, 2);
  assert.ok(snapshots.some(([row]) => row.status === 'pending' && row.lastError === 'offline'));
  assert.equal(rows[0].lastError, '');
});

test('aborting stops further requests without cancelling server jobs', async () => {
  const controller = new AbortController();
  let starts = 0;
  await assert.rejects(refreshNazemAccounts([
    { teacherId: 1, status: 'connected' }, { teacherId: 2, status: 'connected' },
  ], {
    signal: controller.signal,
    api: { refreshImportData: async () => { starts += 1; controller.abort(); return { jobId: 1 }; } },
    onUpdate: () => {}, pause: async () => {},
  }), { name: 'AbortError' });
  assert.equal(starts, 1);
});
