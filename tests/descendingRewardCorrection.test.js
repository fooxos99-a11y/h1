import test from 'node:test';
import assert from 'node:assert/strict';
import { auditDescendingRewards } from '../server/services/descendingRewardAudit.js';
import { correctDescendingReward } from '../server/services/descendingRewardCorrection.js';

const row = { id: 1, studentId: 2, planId: 3, taskDate: '2026-09-09', track: 'memorization',
  fromSurah: 57, fromAyah: 29, toSurah: 56, toAyah: 6, teacherCompleted: 1,
  evaluatedAt: '2026-09-09', dailyPages: 0.5, evaluationScore: 20, points: 288, ledgerPoints: 288 };

test('correction preserves history, subtracts only excess and is safe to retry', async () => {
  const [candidate] = await auditDescendingRewards([row]);
  let balance = 400, ledger = 400, corrected = false;
  const writes = [];
  const connection = { query: async (sql, params) => {
    if (sql.includes('SELECT points')) return [[{ points: balance }]];
    if (sql.includes('WHERE dedupe_key')) return [corrected ? [{ id: 99 }] : []];
    if (sql.includes('AS total')) return [[{ total: ledger }]];
    if (sql.includes('SELECT id, points')) return [[{ id: 1, points: 288 }]];
    writes.push({ sql, params });
    if (sql.includes('UPDATE students')) balance = params[0];
    if (sql.includes('INSERT INTO student_point_transactions')) { assert.equal(params[4], 'deduction'); ledger -= params[5]; corrected = true; }
    return [{ affectedRows: 1 }];
  } };
  const result = await correctDescendingReward(connection, candidate, [row], {});
  assert.equal(result.deducted, 272);
  assert.equal(balance, 128);
  assert.equal(ledger, 128);
  assert.ok(!writes.some(item => item.sql.includes('DELETE')));
  assert.equal(writes.find(item => item.sql.includes('UPDATE student_quran_tasks')).params[1], 16);
  const count = writes.length;
  assert.equal((await correctDescendingReward(connection, candidate, [row], {})).status, 'already_corrected');
  assert.equal(writes.length, count);
});

test('changed evidence and mismatched balances are rejected before any write', async () => {
  const [candidate] = await auditDescendingRewards([row]);
  const connection = { query: async sql => {
    if (sql.includes('SELECT points')) return [[{ points: 400 }]];
    if (sql.includes('WHERE dedupe_key')) return [[]];
    if (sql.includes('AS total')) return [[{ total: 390 }]];
    throw new Error('Unexpected write');
  } };
  await assert.rejects(correctDescendingReward(connection, candidate, [{ ...row, points: 16 }], {}), /evidence changed/);
  await assert.rejects(correctDescendingReward(connection, candidate, [row], {}), /balance requires separate review/);
});
