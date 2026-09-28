import test from 'node:test';
import assert from 'node:assert/strict';
import { historicalPointRecoveryPlan, historicalLinkPointRecoveryPlan, recoverHistoricalNazemPoints } from '../server/services/nazemHistoricalPointRecovery.js';

const daily = { id: 10, studentId: 1, planId: 2, teacherId: 3, status: 'requires_review', syncStatus: 'synced',
  taskDate: '2026-09-01', remoteDate: '2026-09-01', activationDate: '2026-09-08', taskType: 'memorization', track: 'memorization',
  remoteStatus: 'completed', remoteRecordId: '90', expectedPoints: 32, recordedPoints: 0 };
const tasks = [{ id: 5, taskType: 'memorization', track: 'memorization', evaluatedAt: '2026-09-01', teacherCompleted: 1, points: 0 },
  { id: 6, taskType: 'repeat', track: 'memorization', points: 0 }];

test('historical recovery retains the saved entitlement instead of recalculating with current prices', () => {
  const result = historicalPointRecoveryPlan(daily, tasks, 0);
  assert.equal(result.eligible, true);
  assert.equal(result.delta, 32);
  assert.equal(historicalPointRecoveryPlan({ ...daily, expectedPoints: 100 }, tasks, 0).delta, 100);
});

test('an uploaded not-completed evaluation or pending late cannot earn recovery points', () => {
  for (const remoteStatus of ['pending', 'not_completed', '']) {
    assert.equal(historicalPointRecoveryPlan({ ...daily, remoteStatus }, tasks, 0).eligible, false);
  }
  assert.equal(historicalPointRecoveryPlan(daily, [{ ...tasks[0], teacherCompleted: 0 }], 0).reason, 'incomplete_evaluation');
  assert.equal(historicalPointRecoveryPlan(daily, [...tasks, { ...tasks[0], id: 7, taskType: 'link', teacherCompleted: 0 }], 0).eligible, false);
});

test('missing evidence, another date, changed ledger, and already-settled awards require no writes', () => {
  for (const patch of [{ remoteRecordId: null }, { remoteDate: '2026-09-02' }, { expectedPoints: null },
    { recordedPoints: null }, { expectedPoints: 0 }, { status: 'synced' }, { syncStatus: 'pending' },
    { activationDate: null }, { taskDate: '2026-09-08' }]) {
    assert.equal(historicalPointRecoveryPlan({ ...daily, ...patch }, tasks, 0).eligible, false);
  }
  assert.equal(historicalPointRecoveryPlan(daily, tasks, 1).reason, 'changed_ledger');
  assert.equal(historicalPointRecoveryPlan(daily, [{ ...tasks[0], points: 1 }], 0).reason, 'changed_ledger');
});

function fixture({ fail = false } = {}) {
  let state = { student: 100, task: 0, ledger: 0, status: 'requires_review', writes: 0 };
  let snapshot;
  const connection = {
    beginTransaction: async () => { snapshot = { ...state }; },
    commit: async () => {}, rollback: async () => { state = snapshot; },
    query: async (sql, values) => {
      const q = sql.replace(/\s+/g, ' ').trim();
      if (q.startsWith('SELECT ruwasi_student_id')) return [[{ studentId: 1 }]];
      if (q.startsWith('SELECT id FROM students')) return [[{ id: 1 }]];
      if (q.includes('work.expected_points AS expectedPoints')) return [[{ ...daily, status: state.status }]];
      if (q.includes('FROM student_quran_tasks WHERE student_id')) return [[{ ...tasks[0], points: state.task }, tasks[1]]];
      if (q === 'SELECT setting_key, setting_value FROM app_settings') return [[{ setting_key: 'pointsSystemEnabled', setting_value: 'true' }]];
      if (q.includes('FROM student_quran_tasks WHERE id IN')) return [[{ points: state.task }]];
      if (q.startsWith('SELECT points, committee_id')) return [[{ points: state.student, committeeId: null }]];
      if (q.includes('FROM student_point_transactions')) return [[{ total: q.includes('source_id IN') ? state.ledger : 100 + state.ledger, rewardLedger: state.ledger }]];
      state.writes++;
      if (q.startsWith('UPDATE students')) { state.student = values[0]; return [{}]; }
      if (q.startsWith('UPDATE student_quran_tasks')) { state.task = values[1]; return [{}]; }
      if (q.startsWith('DELETE FROM student_point_transactions')) { state.ledger = 0; return [{}]; }
      if (q.startsWith('INSERT INTO student_point_transactions')) {
        if (fail) throw Error('injected ledger failure');
        assert.equal(values.at(-1), 'nazem_historical_recovery:10');
        state.ledger = values[5]; return [{ insertId: 9 }];
      }
      if (q.startsWith('UPDATE nazem_point_reconciliations')) { state.status = 'synced'; return [{}]; }
      throw Error(`Unexpected SQL: ${q}`);
    },
  };
  return { connection, state: () => state };
}

test('preview makes no changes; applying twice restores the historical award exactly once', async () => {
  const f = fixture();
  const preview = await recoverHistoricalNazemPoints(f.connection, 10);
  assert.equal(preview.delta, 32);
  assert.equal(f.state().writes, 0);
  assert.equal((await recoverHistoricalNazemPoints(f.connection, 10, { apply: true })).applied, true);
  assert.equal(f.state().student, 132);
  assert.equal(f.state().task, 32);
  const writes = f.state().writes;
  assert.equal((await recoverHistoricalNazemPoints(f.connection, 10, { apply: true })).eligible, false);
  assert.equal(f.state().writes, writes);
  assert.equal(f.state().student, 132);
});

test('a failed transaction restores both the original balance and the unmodified historical record', async () => {
  const f = fixture({ fail: true });
  await assert.rejects(recoverHistoricalNazemPoints(f.connection, 10, { apply: true }), /injected ledger failure/);
  assert.deepEqual(f.state(), { student: 100, task: 0, ledger: 0, status: 'requires_review', writes: 0 });
});

test('independent completed link recovery preserves failed memorization and later reward corrections', () => {
  const link = { id: 7, taskType: 'link', track: 'memorization', points: 0, teacherCompleted: 1,
    evaluatedAt: '2026-09-01', evaluationScore: 10, actualLinkCount: 5 };
  const failed = historicalLinkPointRecoveryPlan({ ...daily, remoteLinkCount: 5, expectedPoints: 10 },
    [{ ...tasks[0], teacherCompleted: 0 }, link], 0);
  assert.equal(failed.eligible, true);
  assert.deepEqual(failed.taskIds, [7]);
  assert.equal(failed.dailyTotal, 10);
  const corrected = historicalLinkPointRecoveryPlan({ ...daily, remoteLinkCount: 5, expectedPoints: 48, recordedPoints: 38 },
    [{ ...tasks[0], points: 26 }, { ...tasks[1], points: 10 }, link], 36);
  assert.equal(corrected.eligible, true);
  assert.equal(corrected.delta, 10);
  assert.equal(corrected.dailyTotal, 46);
  for (const patch of [{ teacherCompleted: 0 }, { actualLinkCount: 4 }, { points: 10 }, { evaluationScore: 11 }]) {
    assert.equal(historicalLinkPointRecoveryPlan({ ...daily, remoteLinkCount: 5, expectedPoints: 10 },
      [{ ...tasks[0], teacherCompleted: 0 }, { ...link, ...patch }], 0).eligible, false);
  }
  assert.equal(historicalLinkPointRecoveryPlan({ ...daily, remoteLinkCount: null, expectedPoints: 10 }, [link], 0).eligible, false);
  assert.equal(historicalLinkPointRecoveryPlan({ ...daily, remoteLinkCount: 5, expectedPoints: 10, status: 'synced' }, [link], 0).eligible, false);
});
