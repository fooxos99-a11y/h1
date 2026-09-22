import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStudentPlanPoints } from '../server/services/studentPlanPoints.js';
import { calculateSegmentedPlanPoints } from '../server/services/quranPlanProgress.js';

test('244 daily categories total 75 with teacher execution, while 150 program points stay separate', () => {
  const date = '2026-09-22';
  const result = buildStudentPlanPoints({ today: date, total: 175, attendance: [],
    rows: ['memorization', 'review', 'link'].map(taskType => ({ taskDate: date, taskType, track: 'memorization', pointsMaximum: taskType === 'memorization' ? 20 : 10 })),
    settings: { attendancePoints: 25, hasStudentQuranExecution: false, memorizationRepeatCount: 10, memorizationListeningCount: 3, memorizationRepeatPointValue: 5, memorizationListeningPointValue: 5 },
    transactions: [{ date, type: 'increase', source: 'attendance', points: 25 }, { date, type: 'increase', source: 'learning_path', points: 150 }],
  });
  assert.equal(result.total, 175);
  assert.equal(result.days[0].earned, 25);
  assert.equal(result.days[0].maximum, 75);
  assert.equal(result.days[0].additionalEarned, 150);
  assert.deepEqual(result.days[0].maximumDetails, [
    { label: 'الحضور', maximum: 25 },
    { label: 'الحفظ', maximum: 30, parts: [{ label: 'الحفظ', maximum: 20 }, { label: 'السماع', maximum: 5 }, { label: 'التكرار', maximum: 5 }] },
    { label: 'المراجعة', maximum: 10 }, { label: 'الربط', maximum: 10 },
  ]);
});

test('completed scheduled memorization receives its evaluated score despite verse-line rounding', () => {
  for (const amount of [0.47, 0.53]) {
    for (const score of [0, 15, 20]) {
      const result = calculateSegmentedPlanPoints({ basePoints: score, dailyAmount: 0.5, segments: [{ type: 'normal', amount }], normalCompleted: true });
      assert.equal(result.total, score);
    }
  }
  assert.equal(calculateSegmentedPlanPoints({ basePoints: 20, dailyAmount: 0.5, segments: [{ type: 'normal', amount: 0.25 }], normalCompleted: false }).total, 10);
  assert.equal(calculateSegmentedPlanPoints({ basePoints: 20, dailyAmount: 0.5, normalCompleted: true, segments: [{ type: 'normal', amount: 0.53 }, { type: 'extra', amount: 0.5 }], extraPercent: 50 }).total, 30);
});
