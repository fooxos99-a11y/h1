import test from 'node:test';
import assert from 'node:assert/strict';
import { settleNazemPoints } from '../server/services/nazemPointReconciliation.js';
import { classifyPlanExecution } from '../shared/quran-plan-execution.js';

test('execution policy violations are reviewable validation errors', () => {
  const p = (ayah) => ({ page: 1, surah: 1, ayah });
  const base = { actualStart: p(2), normalEnd: p(3), scheduledEnd: p(5) };
  for (const options of [
    { actualEnd: p(1) },
    { actualEnd: p(4), allowCompensation: false },
    { actualEnd: p(6), allowExtra: false },
  ]) {
    assert.throws(() => classifyPlanExecution({ ...base, ...options }), { statusCode: 422 });
  }
});

test('a historical range conflicting with its plan is quarantined without blocking subsequent settlement work', async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    rollback: async () => calls.push('rollback'),
    commit: async () => calls.push('commit'),
    query: async (sql, values) => {
      const q = sql.replace(/\s+/g, ' ');
      if (q.startsWith('SELECT ruwasi_student_id')) {
        calls.push(`identity:${values[0]}`);
        return [[{ studentId: 163 }]];
      }
      if (q.startsWith('SELECT id FROM students')) return [[{ id: 163 }]];
      if (q.includes('work.source_hash AS sourceHash')) return [[{
        id: values[0], studentId: 163, planId: 101, teacherId: 1, taskDate: '2026-09-20',
        taskType: 'memorization', track: 'memorization', syncStatus: 'synced',
        status: values[0] === 1 ? 'pending' : 'synced', sourceHash: 'historical-version',
      }]];
      if (q.includes("setting_key = 'nazemPointsStartDate'")) return [[{ value: '2026-09-01' }]];
      if (q.includes('FROM student_quran_tasks task')) return [[{
        id: 382707, taskType: 'memorization', track: 'memorization', planTrack: 'memorization',
        evaluatedAt: '2026-09-20', teacherCompleted: 1, evaluationScore: 12,
        fromPage: 604, fromSurah: 112, fromAyah: 4, toPage: 603, toSurah: 111, toAyah: 3,
        planStartPage: 604, planStartSurah: 114, planStartAyah: 1,
        planEndPage: 604, planEndSurah: 114, planEndAyah: 6,
      }]];
      if (q === 'SELECT setting_key, setting_value FROM app_settings') return [[]];
      if (q.startsWith('UPDATE nazem_point_reconciliations')) {
        assert.match(q, /status = 'requires_review'/);
        assert.match(q, /source_hash = \?/);
        assert.deepEqual(values, [null, null, 'نهاية التنفيذ تسبق بدايته.', 1, 'historical-version']);
        calls.push('review');
        return [{}];
      }
      throw new Error(`Unexpected SQL: ${q}`);
    },
  };
  for (const id of [1, 2]) assert.equal(await settleNazemPoints(connection, id), false);
  assert.deepEqual(calls, ['begin', 'identity:1', 'rollback', 'review', 'begin', 'identity:2', 'commit']);
});
