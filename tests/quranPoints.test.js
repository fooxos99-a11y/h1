import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateProportionalPoints,
  calculateStudentExecutionPoints,
} from '../server/services/quranPoints.js';

test('repetition points are proportional to the completed count', () => {
  assert.equal(calculateProportionalPoints(10, 30, 30), 10);
  assert.equal(calculateProportionalPoints(10, 27, 30), 9);
  assert.equal(calculateProportionalPoints(10, 0, 30), 0);
});

test('student execution awards one point for every completed repetition', () => {
  assert.deepEqual(calculateStudentExecutionPoints({
    taskType: 'memorization',
    track: 'memorization',
    completedAmount: 5,
    expectedAmount: 10,
    completedRepeatCount: 27,
    expectedRepeatCount: 30,
    settings: { memorizationEvaluationMaxScore: 10 },
  }), {
    taskPoints: 0,
    repeatPoints: 27,
    listeningPoints: 0,
    total: 27,
    label: 'الحفظ والتكرار والسماع',
  });
});

test('each completed listening earns its configured ten points', () => {
  assert.deepEqual(calculateStudentExecutionPoints({
    taskType: 'memorization',
    track: 'memorization',
    completedRepeatCount: 30,
    expectedRepeatCount: 30,
    completedListeningCount: 2,
    expectedListeningCount: 3,
    settings: {
      memorizationEvaluationMaxScore: 9,
      memorizationRepeatPointValue: 1,
      memorizationListeningPointValue: 10,
    },
  }), {
    taskPoints: 0,
    repeatPoints: 30,
    listeningPoints: 20,
    total: 50,
    label: 'الحفظ والتكرار والسماع',
  });
});

test('Nazem repetition rewards every selected repetition and listening only once for yes', () => {
  assert.deepEqual(calculateStudentExecutionPoints({
    taskType: 'memorization',
    track: 'memorization',
    completedRepeatCount: 30,
    expectedRepeatCount: 30,
    completedListeningCount: 1,
    expectedListeningCount: 1,
    settings: {
      memorizationRepeatPointValue: 1,
      memorizationListeningPointValue: 10,
    },
  }), {
    taskPoints: 0,
    repeatPoints: 30,
    listeningPoints: 10,
    total: 40,
    label: 'الحفظ والتكرار والسماع',
  });
});

test('review and link use the existing recitation control score proportionally', () => {
  const review = calculateStudentExecutionPoints({
    taskType: 'review',
    completedAmount: 5,
    expectedAmount: 10,
    settings: { reviewEvaluationMaxScore: 20 },
  });
  const link = calculateStudentExecutionPoints({
    taskType: 'link',
    completedAmount: 3,
    expectedAmount: 10,
    settings: { linkEvaluationMaxScore: 30 },
  });

  assert.equal(review.total, 10);
  assert.equal(link.total, 9);
});

test('proportional Quran points are always whole numbers', () => {
  const points = calculateProportionalPoints(10, 1, 6);

  assert.equal(points, 2);
  assert.equal(Number.isInteger(points), true);
});
