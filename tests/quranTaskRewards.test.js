import test from 'node:test';
import assert from 'node:assert/strict';
import { setQuranTaskGroupReward } from '../server/services/quranTaskRewards.js';

function memoryConnection(oldReward = 20, otherAwards = 58, { ledger = oldReward, previousDay = false } = {}) {
  const state = { reward: oldReward, ledger, points: ledger + otherAwards };
  return { state, async query(sql, values = []) {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT id FROM students')) return [[{ id: 1 }]];
    if (q.includes('FROM student_quran_tasks')) return [[{ points: state.reward }]];
    if (q.startsWith('SELECT points, committee_id')) return [[{ points: state.points }]];
    if (q.includes('AS rewardLedger')) return [[{ rewardLedger: state.ledger, rewardToday: previousDay ? 0 : state.ledger }]];
    if (q.includes('AS awardedToday')) return [[{ awardedToday: otherAwards + (previousDay ? 0 : state.ledger) }]];
    if (q.startsWith('UPDATE student_quran_tasks')) { state.reward = values[1]; return [{}]; }
    if (q.startsWith('UPDATE students')) { state.points = values[0]; return [{}]; }
    if (q.startsWith('DELETE FROM student_point_transactions')) { state.ledger = 0; return [{}]; }
    if (q.startsWith('INSERT INTO student_point_transactions')) { state.ledger = values[5]; return [{}]; }
    if (q.startsWith('SELECT GREATEST')) return [[{ total: state.ledger + otherAwards }]];
    throw new Error(`Unexpected query: ${q}`);
  } };
}
const reward = (connection, points) => setQuranTaskGroupReward(connection, {
  taskIds: [1], studentId: 1, targetPoints: points, settings: { maxDailyStudentPoints: 78 },
  date: '2026-09-08', sourceType: 'quran_evaluation', dedupeKey: 'test:1',
});

test('re-evaluation awards the actual difference without a daily cap', async () => {
  const connection = memoryConnection();
  await reward(connection, 35); await reward(connection, 35);
  assert.deepEqual(connection.state, { reward: 35, ledger: 35, points: 93 });
});
test('repeated evaluation is idempotent at the daily limit and reductions restore only the available capacity', async () => {
  const connection = memoryConnection();
  await reward(connection, 20); await reward(connection, 20);
  assert.equal(connection.state.points, 78);
  await reward(connection, 10);
  assert.equal(connection.state.points, 68);
  await reward(connection, 20);
  assert.equal(connection.state.points, 78);
  await reward(connection, 0);
  assert.deepEqual(connection.state, { reward: 0, ledger: 0, points: 58 });
});
test('first award is not blocked by an old daily limit', async () => {
  const connection = memoryConnection(0, 58);
  await reward(connection, 21);
  assert.equal(connection.state.points, 79);
  await reward(connection, 20);
  assert.equal(connection.state.points, 78);
});


test('ledger drift is rejected before any reward or balance mutation', async () => {
  const connection = memoryConnection(20, 78, { ledger: 0 });
  const before = { ...connection.state };
  await assert.rejects(reward(connection, 20), /سجل نقاط/);
  assert.deepEqual(connection.state, before);
});

test('moving an unchanged old reward preserves its total without a daily cap', async () => {
  const connection = memoryConnection(20, 78, { previousDay: true });
  const before = { ...connection.state };
  await reward(connection, 20);
  assert.deepEqual(connection.state, before);
});
