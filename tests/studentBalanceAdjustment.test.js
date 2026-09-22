import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePointAdjustmentTarget, setStudentStoreBalance } from '../server/services/studentBalanceAdjustment.js';

function database(balance = 40) {
  const writes = [];
  return { writes, query: async (sql, params) => {
    if (sql.startsWith('SELECT')) return [[{ balance }]];
    writes.push({ sql, params });
    return [{ affectedRows: 1 }];
  } };
}
test('wallet-only increase and deduction change only wallet and keep an auditable ledger', async () => {
  for (const balance of [60, 20]) {
    const c = database();
    assert.equal(await setStudentStoreBalance(c, { studentId: 7, balance, expectedBalance: 40, reason: 'تصحيح', actor: { id: 1, role: 'manager' } }), balance - 40);
    assert.match(c.writes[0].sql, /SET store_balance = \?/);
    assert.doesNotMatch(c.writes.map(x => x.sql).join(' '), /student_point_transactions|committees|SET points/);
    assert.deepEqual(c.writes[1].params.slice(0, 5), [7, balance - 40, 40, balance, 'تصحيح']);
  }
});
test('reject invalid or stale wallet edits before any write', async () => {
  for (const change of [{ balance: -1 }, { balance: 2.5 }, { expectedBalance: 39 }, { expectedBalance: undefined }, { reason: '' }]) {
    const c = database();
    await assert.rejects(setStudentStoreBalance(c, { studentId: 7, balance: 60, expectedBalance: 40, reason: 'سبب', ...change }));
    assert.equal(c.writes.length, 0);
  }
  assert.equal(normalizePointAdjustmentTarget(), 'both');
  assert.throws(() => normalizePointAdjustmentTarget('all'));
});
