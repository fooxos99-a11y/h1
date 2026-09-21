import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { loadNazemErrors } from '../src/services/nazemErrorsService.js';

test('Nazem issue requests overlap within a bounded queue and retain individual failures and order', async () => {
  let running = 0;
  let peak = 0;
  const accounts = Array.from({ length: 10 }, (_, teacherId) => ({ teacherId, status: 'failed' }));
  const result = await loadNazemErrors({
    getAccounts: async () => accounts,
    getConflicts: async () => [{ id: 1 }],
    getAccountIssues: async id => {
      running += 1;
      peak = Math.max(peak, running);
      await setTimeout(5);
      running -= 1;
      if (id === 2) throw new Error('unavailable');
      return { studentIssues: [] };
    },
  });
  assert.equal(peak, 4);
  assert.deepEqual(result.rows.map(row => row.account.teacherId), accounts.map(row => row.teacherId));
  assert.equal(result.rows[2].error, 'unavailable');
  assert.deepEqual(result.conflicts, [{ id: 1 }]);
});

test('closing Nazem errors prevents queued requests from starting', async () => {
  let calls = 0;
  const result = await loadNazemErrors({
    getAccounts: async () => [{ teacherId: 1, status: 'failed' }],
    getConflicts: async () => [],
    getAccountIssues: async () => { calls += 1; },
  }, { isActive: () => false });
  assert.equal(calls, 0);
  assert.deepEqual(result.rows, []);
});
