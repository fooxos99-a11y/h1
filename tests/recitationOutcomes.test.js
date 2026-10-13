import test from 'node:test';
import assert from 'node:assert/strict';
import { attachRecitationOutcomes } from '../shared/recitation-outcomes.js';
import { shouldShowRecitationStudent } from '../src/lib/recitationActionState.js';
import { mergeCommittedOfflineEvaluation } from '../src/lib/offlineEvaluationMerge.js';
import { getRecitationAmountDayOffset, normalizeRecitationAmountDay } from '../shared/recitation-amount-day.js';

test('recitation defaults to today and retains an explicit previous-day preference', () => {
  assert.equal(normalizeRecitationAmountDay(undefined), 'same_day');
  assert.equal(getRecitationAmountDayOffset(undefined), 0);
  assert.equal(getRecitationAmountDayOffset('same_day'), 0);
  assert.equal(getRecitationAmountDayOffset('previous_day'), -1);
});

const student = { studentId: 8, attendanceStatus: 'present', recitationFinished: true };
const receipt = { taskId: 1, studentId: 8, taskType: 'memorization', track: 'memorization',
  taskDate: '2026-10-13', teacherCompleted: false, evaluationScore: 0, status: 'server_saved' };

test('a saved zero result stays visible as not memorized rather than finished or missing', () => {
  const [result] = attachRecitationOutcomes([student], [receipt]);
  assert.equal(result.recitationFinished, false);
  assert.equal(result.recitationOutcomes[0].label, 'لم يتم الحفظ');
  assert.equal(shouldShowRecitationStudent(result), true);
});

test('review failure remains distinct and any failed member fails its review group', () => {
  const [result] = attachRecitationOutcomes([student], [
    { ...receipt, taskType: 'review', teacherCompleted: true },
    { ...receipt, taskType: 'review', taskId: 2 },
  ]);
  assert.equal(result.recitationOutcomes.length, 1);
  assert.equal(result.recitationOutcomes[0].label, 'لم تتم المراجعة');
});

test('a newer successful retry replaces a failure without changing other students or tracks', () => {
  const [result, other] = attachRecitationOutcomes([student, { ...student, studentId: 9 }], [
    { ...receipt, attemptId: 2, evaluatedAt: '2026-10-13 17:00', teacherCompleted: true },
    { ...receipt, attemptId: 1, evaluatedAt: '2026-10-13 16:00' },
    { ...receipt, taskId: 2, track: 'mastery' },
  ]);
  assert.equal(result.recitationOutcomes.find(outcome => outcome.track === 'memorization').teacherCompleted, true);
  assert.equal(result.recitationOutcomes.find(outcome => outcome.track === 'mastery').label, 'لم يتم الإتقان');
  assert.deepEqual(other.recitationOutcomes || [], []);
});

test('a result for a newer amount supersedes an older failed amount', () => {
  const [result] = attachRecitationOutcomes([student], [
    { ...receipt, taskId: 2, taskDate: '2026-10-14', teacherCompleted: true }, receipt,
  ]);
  assert.equal(result.recitationFinished, true);
  assert.equal(result.recitationOutcomes[0].taskDate, '2026-10-14');
  assert.equal(shouldShowRecitationStudent(result), false);
});

test('durable negative submissions keep their outcome through offline rehydration and acknowledgement', () => {
  const task = { id: 1, planId: 17, studentId: 8, taskType: 'memorization', taskDate: receipt.taskDate };
  const evaluation = { date: receipt.taskDate, tasks: [task], taskQueue: [task], students: [student] };
  for (const status of ['pending', 'synced']) {
    const item = { taskId: 1, planId: 17, taskType: task.taskType, taskDate: task.taskDate, payload: { notMemorized: true },
      ...(status === 'synced' ? { synced: true, result: { ok: true, teacherCompleted: false, evaluationScore: 0 } } : {}) };
    const result = mergeCommittedOfflineEvaluation(evaluation, [{ studentId: 8, sessionDate: evaluation.date, status, tasks: [item] }]);
    assert.equal(result.students[0].recitationOutcomes[0].label, 'لم يتم الحفظ');
    assert.equal(result.students[0].recitationFinished, false);
    assert.equal(shouldShowRecitationStudent(result.students[0]), true);
  }
});

test('rejected submissions and ungraded positive submissions do not claim a completed result', () => {
  const task = { id: 1, planId: 17, studentId: 8, taskType: 'memorization', taskDate: receipt.taskDate };
  const evaluation = { date: receipt.taskDate, tasks: [task], taskQueue: [task], students: [student] };
  for (const [status, payload] of [['conflict', { notMemorized: true }], ['pending', {}]]) {
    const result = mergeCommittedOfflineEvaluation(evaluation, [{ studentId: 8, sessionDate: evaluation.date, status,
      tasks: [{ taskId: 1, planId: 17, taskType: task.taskType, payload }] }]);
    assert.deepEqual(result.students[0].recitationOutcomes || [], []);
  }
});
