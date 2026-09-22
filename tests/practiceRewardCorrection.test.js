import assert from 'node:assert/strict';
import test from 'node:test';
import { planPracticeRewardCorrection } from '../server/services/practiceRewardCorrection.js';
import { practiceCompletionCount } from '../shared/practice-completion.js';

test('yes/no preserves Nazem planned count and accepts explicit no', () => {
  assert.equal(practiceCompletionCount(1, 10), 10);
  assert.equal(practiceCompletionCount(0, 10), 0);
  assert.equal(practiceCompletionCount(1, 0), 0);
  assert.equal(practiceCompletionCount('bad', 10), 0);
});

test('historical repricing groups segments once and preserves unawarded records', () => {
  const base = { studentId: 1, planId: 2, taskDate: '2026-09-20', track: 'memorization', actualRepeatCount: 20, actualListeningCount: 3 };
  const result = planPracticeRewardCorrection([{ ...base, id: 1, points: 26 }, { ...base, id: 2, points: 0 },
    { ...base, id: 3, taskDate: '2026-09-21', points: 0 }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].target, 10);
  assert.equal(result[0].delta, -16);
  assert.equal(planPracticeRewardCorrection([{ ...base, id: 1, points: 10 }])[0].delta, 0);
});
