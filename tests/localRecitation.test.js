import test from 'node:test';
import assert from 'node:assert/strict';
import { countEvaluationItems } from '../shared/nazem-recitation-policy.js';
import { countRecitationPayload, calculateGroupRecitationOutcome } from '../shared/recitation-group-evaluation.js';
import { buildReviewCycle, reviewEndOptions, selectReviewEnd } from '../shared/quran-review-cycle.js';
import { loadRecitationGroupEvaluation } from '../server/services/recitationGroupEvaluation.js';
import { prepareTeacherReviewRange } from '../server/services/teacherReviewRange.js';
import { needsRecitationPreparation, mergePreparedRecitationTasks } from '../src/lib/recitationPreparation.js';

const policy = { type: 'review', maxScore: 20, passingScore: 10, mistakeDeduction: 2, warningDeduction: 1 };
const group = [2, 1, 3].map(id => ({ id, studentId: 7, planId: 9, taskDate: '2026-10-13', taskType: 'link', track: 'memorization', targetPages: 2 }));

test('local linking has one counter and stores each error only once', () => {
  assert.deepEqual(countEvaluationItems(group), [{ id: 1 }]);
  const counts = { 1: { mistakeCount: 2, warningCount: 3 } };
  const payloads = group.map(task => countRecitationPayload(task, group, counts));
  assert.equal(payloads.reduce((sum, payload) => sum + payload.mistakeCount, 0), 2);
  assert.equal(payloads.reduce((sum, payload) => sum + payload.warningCount, 0), 3);
  assert.ok(payloads.every(payload => payload.groupEvaluation.mistakeCount === 2));
  assert.equal(countEvaluationItems(group.map(task => ({ ...task, taskType: 'memorization' }))).length, 1);
  assert.equal(countEvaluationItems(group.map(task => ({ ...task, nazemManaged: true }))).length, 1);
});

test('partial review scales the earned score against the original requirement and extra reading is capped', () => {
  for (const [evaluatedFaces, score] of [[5, 10], [10, 20], [15, 20]]) {
    const result = calculateGroupRecitationOutcome({ policy, taskType: 'review', evaluatedFaces, expectedFaces: 10, warningCount: 0, mistakeCount: 0 });
    assert.equal(result.score, score);
    assert.equal(result.completed, true);
  }
  assert.equal(calculateGroupRecitationOutcome({ policy, taskType: 'review', evaluatedFaces: 5, expectedFaces: 10, warningCount: 0, mistakeCount: 2 }).score, 8);
});

const ayahs = [78, 79, 80, 114].flatMap((surah, page) => [1, 2].map(ayah => ({ surah, ayah, page: page + 1 })));
const cycle = { ...buildReviewCycle({ ayahs, start: ayahs[4], direction: -1, isAvailable: ayah => ayah.surah !== 79 }), expectedFaces: 2 };

test('teacher endpoint selection follows the review wrap and excludes unavailable verses', () => {
  const selected = selectReviewEnd(cycle, { surah: 114, ayah: 2 });
  assert.equal(selected.faces, 3);
  assert.deepEqual(selected.ranges.map(range => [range.start.surah, range.end.surah]), [[80, 80], [78, 78], [114, 114]]);
  assert.ok(reviewEndOptions(cycle).every(option => option.surah !== 79));
  assert.throws(() => selectReviewEnd(cycle, { surah: 79, ayah: 1 }), RangeError);
});

test('range preparation retains scheduled faces and does not approve execution', async () => {
  const calls = [];
  const tasks = group.slice(0, 2).map(task => ({ ...task, taskType: 'review', targetPages: 1 }));
  const result = await prepareTeacherReviewRange({ query: async (sql, params) => { calls.push({ sql, params }); } }, tasks, cycle, { surah: 80, ayah: 2 });
  assert.equal(JSON.parse(result.tasks[0].reviewExecution).expectedFaces, 2);
  assert.equal(JSON.parse(result.tasks[0].reviewExecution).faces, 1);
  assert.equal(JSON.parse(result.tasks[1].reviewExecution).faces, 0);
  assert.ok(result.tasks.every(task => task.targetPages === 1));
  assert.ok(calls.every(call => !/student_status|teacher_completed|executed_at/.test(call.sql)));
  await assert.rejects(prepareTeacherReviewRange({}, tasks, cycle, { surah: 79, ayah: 1 }), { statusCode: 422 });
});

test('group evaluation rejects missing and foreign task IDs and derives its denominator from stored rows', async () => {
  const rows = group.map(task => ({ ...task, reviewExecution: JSON.stringify(task.id === 1 ? { faces: 3, ranges: [], expectedFaces: 999 } : { faces: 0, ranges: [], anchorId: 1 }) }));
  const connection = { query: async () => [rows] };
  const task = { ...group[0], taskType: 'review' };
  const input = { taskIds: [1, 2, 3], mistakeCount: 0, warningCount: 0 };
  const result = await loadRecitationGroupEvaluation(connection, task, input, () => policy, () => { throw new Error('must use the saved review path'); });
  assert.equal(result.score, 10);
  assert.equal(result.evaluatedFaces, 3);
  for (const taskIds of [[1], [1, 2, 99], [1, 1, 3]]) await assert.rejects(loadRecitationGroupEvaluation(connection, task, { ...input, taskIds }, () => policy, () => 1), { statusCode: 422 });
  await assert.rejects(loadRecitationGroupEvaluation(connection, { ...task, nazemManaged: true }, input, () => policy, () => 1), { statusCode: 422 });
  await assert.rejects(loadRecitationGroupEvaluation(connection, task, input, () => policy, () => 1, 'count', null, { warningCount: 0, mistakeCount: 1 }), { statusCode: 422 });
});

test('Mushaf group scores use validated marks rather than submitted counter totals', async () => {
  const rows = group.map(task => ({ ...task, reviewExecution: null }));
  const input = { taskIds: [1, 2, 3], mistakeCount: 0, warningCount: 0, wordMarksByTask: { 1: [{}], 2: [], 3: [] } };
  const result = await loadRecitationGroupEvaluation({ query: async () => [rows] }, { ...group[0], taskType: 'review' }, input, () => policy, () => 2, 'mushaf', async (_row, marks) => ({ warningCount: 0, mistakeCount: marks.length }));
  assert.equal(result.score, 18);
  await assert.rejects(loadRecitationGroupEvaluation({ query: async () => [rows] }, group[0], input, () => policy, () => 2), { statusCode: 422 });
});

test('an unchanged complete review retains its full score despite fractional page boundaries', async () => {
  const rows = [{ id: 1, targetPages: 5, fromPage: 2, toPage: 6, fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 29 }];
  const result = await loadRecitationGroupEvaluation({ query: async () => [rows] }, { ...group[1], taskType: 'review' },
    { taskIds: [1], warningCount: 0, mistakeCount: 0 }, () => policy, () => 4.75);
  assert.equal(result.score, 20);
  assert.equal(result.evaluatedFaces, 5);
});

test('unchanged selection opens immediately even when its page metadata is incomplete', () => {
  const task = { ...group[0], taskType: 'memorization', toSurah: 95, toAyah: 8, toPage: 597 };
  assert.equal(needsRecitationPreparation({ tasks: [task], actualEnd: { surah: 95, ayah: 8, page: 0 } }), false);
  assert.equal(needsRecitationPreparation({ tasks: [task], rangeChanged: true, actualEnd: { surah: 95, ayah: 8, page: 0 } }), false);
  assert.equal(needsRecitationPreparation({ tasks: [task], rangeChanged: true, actualEnd: { surah: 95, ayah: 6 } }), true);
});

test('preparation responses retain recitation metadata and invalidate zero-face review members', () => {
  const original = [{ ...group[0], planVersion: 4, reviewExpectedFaces: 6 }];
  const prepared = { actualEnd: { surah: 80, ayah: 2 }, tasks: [{ ...group[0], taskType: 'review', reviewExecution: JSON.stringify({ faces: 0, ranges: [], anchorId: 1 }) }] };
  const [task] = mergePreparedRecitationTasks(original, prepared);
  assert.equal(task.planVersion, 4);
  assert.equal(task.actualFaces, 0);
  assert.equal(task.reviewGroupMember, true);
});
