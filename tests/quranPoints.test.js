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

test('repetition earns five points once regardless of the historical count', () => {
  assert.deepEqual(calculateStudentExecutionPoints({
    taskType: 'memorization',
    track: 'memorization',
    completedAmount: 5,
    expectedAmount: 10,
    completedRepeatCount: 27,
    expectedRepeatCount: 30,
    settings: { memorizationEvaluationMaxScore: 10 },
  }), {
    taskPoints: 5,
    repeatPoints: 5,
    listeningPoints: 0,
    total: 10,
    label: 'الحفظ والتكرار والسماع',
  });
});

test('each practice uses its configured score once', () => {
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
    repeatPoints: 1,
    listeningPoints: 10,
    total: 11,
    label: 'الحفظ والتكرار والسماع',
  });
});

test('Nazem repetition and listening both reward yes once', () => {
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
    repeatPoints: 1,
    listeningPoints: 10,
    total: 11,
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


test('yes/no practice awards are independent across both tracks', () => {
  for (const track of ['memorization', 'mastery']) {
    for (const repeat of [0, 1, 10, 30]) {
      for (const listening of [0, 1, 3]) {
        const reward = calculateStudentExecutionPoints({ taskType: 'memorization', track,
          completedRepeatCount: repeat, completedListeningCount: listening });
        assert.equal(reward.repeatPoints, repeat > 0 ? 5 : 0);
        assert.equal(reward.listeningPoints, listening > 0 ? 5 : 0);
      }
    }
  }
});

test('recorded memorization earns its score now, while practice-only calls never award memorization', () => {
 for (const track of ['memorization', 'mastery']) {
  const settings = { memorizationEvaluationMaxScore: 100, masteryEvaluationMaxScore: 80 };
  const args = {taskType:'memorization', track, settings, completedRepeatCount:1, completedListeningCount:1};
  assert.equal(calculateStudentExecutionPoints(args).total, 10);
  assert.equal(calculateStudentExecutionPoints({...args,completedAmount:1,expectedAmount:1}).total, track === 'memorization' ? 110 : 90);
  assert.equal(calculateStudentExecutionPoints({...args,completedAmount:0.5,expectedAmount:1}).taskPoints, track === 'memorization' ? 50 : 40);
  assert.equal(calculateStudentExecutionPoints({...args,completedAmount:0,expectedAmount:1,completedRepeatCount:0,completedListeningCount:0}).total, 0);
 }
});
