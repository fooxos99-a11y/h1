import test from 'node:test';
import assert from 'node:assert/strict';
import { countEvaluationItems } from '../shared/nazem-recitation-policy.js';
import { countRecitationPayload } from '../shared/recitation-group-evaluation.js';
import { groupRecitationCompensations, isDailyRecitationTask, localRecitationScopeError, partitionRecitationSessionTasks } from '../shared/recitation-session-scope.js';
import { advanceRecitationTaskQueue } from '../src/lib/recitationTaskQueue.js';
import { shouldShowRecitationStudent } from '../src/lib/recitationActionState.js';
import { loadRecitationGroupEvaluation } from '../server/services/recitationGroupEvaluation.js';

const date = '2026-10-13';
const base = { studentId: 7, planId: 9, taskType: 'memorization', track: 'memorization', taskDate: date, teacherCompleted: null, nazemManaged: false };
const today = [1, 2, 3].map(id => ({ ...base, id, targetPages: 1, fromPage: id, toPage: id, fromSurah: 1, toSurah: 1, fromAyah: id, toAyah: id }));
const old = [{ ...today[0], id: 10, taskDate: '2026-10-12' }, { ...today[1], id: 11, taskDate: '2026-10-12' },
  { ...today[2], id: 12, taskType: 'review', taskDate: '2026-10-12' }, { ...today[2], id: 13, taskType: 'link', taskDate: '2026-10-12' }];

test('old compensations do not prevent daily completion and remain available independently', () => {
  const scope = partitionRecitationSessionTasks(old, date, true);
  assert.deepEqual(scope.dailyTasks, []);
  assert.equal(scope.dailyStudentIds.has(7), false);
  assert.deepEqual(scope.compensationTasks.map(task => task.id), [10, 11, 12]);
  const unfinished = partitionRecitationSessionTasks([{ ...today[0], studentId: '7' }, ...old], date, true);
  assert.equal(unfinished.dailyStudentIds.has(7), true);
  assert.deepEqual(unfinished.dailyTasks.map(task => task.id), [1]);
  assert.deepEqual(partitionRecitationSessionTasks(old, date, false).compensationTasks, []);
});

test('authoritative Nazem work still prevents completion even with an older task date', () => {
  const authoritative = { ...old[0], nazemManaged: 1 };
  const scope = partitionRecitationSessionTasks([authoritative, old[2]], date, true);
  assert.deepEqual(scope.dailyTasks, [authoritative]);
  assert.equal(scope.dailyStudentIds.has(7), true);
  assert.deepEqual(scope.compensationTasks, [old[2]]);
});

test('the daily lesson excludes old work while compensation separates its day and type', () => {
  assert.deepEqual([...today, ...old].filter(task => isDailyRecitationTask(task, date)), today);
  const groups = groupRecitationCompensations([...today, ...old], date, true);
  assert.deepEqual(groups.map(group => group.tasks.map(task => task.id)), [[10, 11], [12]]);
  assert.deepEqual(groupRecitationCompensations(old, date, false), []);
  assert.deepEqual(groupRecitationCompensations(old.map(task => ({ ...task, teacherCompleted: true })), date, true), []);
});

test('one memorization lesson has one counter and stores each error once', () => {
  assert.deepEqual(countEvaluationItems(today), [{ id: 1 }]);
  const counts = { 1: { mistakeCount: 2, warningCount: 1 } };
  const payloads = today.map(task => countRecitationPayload(task, today, counts));
  assert.equal(payloads.reduce((sum, payload) => sum + payload.mistakeCount, 0), 2);
  assert.equal(payloads.reduce((sum, payload) => sum + payload.warningCount, 0), 1);
  assert.deepEqual(payloads[0].groupEvaluation.taskIds, [1, 2, 3]);
});

test('the server distinguishes today, compensation, disabled permission and future work', () => {
  assert.equal(localRecitationScopeError(today[0], date, false, true), null);
  assert.equal(localRecitationScopeError(old[0], date, false, true).statusCode, 422);
  assert.equal(localRecitationScopeError(old[0], date, true, true), null);
  assert.equal(localRecitationScopeError(old[2], date, true, true), null);
  assert.equal(localRecitationScopeError(old[0], date, true, false).statusCode, 403);
  assert.equal(localRecitationScopeError(old[3], date, true, true).statusCode, 422);
  assert.equal(localRecitationScopeError(today[0], date, true, true).statusCode, 422);
  assert.equal(localRecitationScopeError({ ...today[0], taskDate: '2026-10-14' }, date, false, true).statusCode, 422);
  assert.equal(localRecitationScopeError(old[0], date, 'true', true).statusCode, 422);
});

test('recorded compensation replays and existing offline clients retain their authorized scope', () => {
  assert.equal(localRecitationScopeError({ ...old[0], teacherCompleted: true }, date, true, true), null);
  assert.equal(localRecitationScopeError(old[0], date, undefined, true), null);
  assert.equal(localRecitationScopeError(old[0], date, undefined, false).statusCode, 403);
});

test('finishing compensation leaves the daily lesson intact and removes only its own backlog', () => {
  const state = advanceRecitationTaskQueue({ tasks: today, taskQueue: [...today, ...old], compensationTasks: old }, old.slice(0, 2));
  assert.deepEqual(state.tasks, today);
  assert.deepEqual(state.compensationTasks.map(task => task.id), [12, 13]);
  const student = { studentId: 7, attendanceStatus: 'present', recitationFinished: true };
  assert.equal(shouldShowRecitationStudent(student, [], [], old), true);
  assert.equal(shouldShowRecitationStudent(student, [], []), false);
});

test('memorization aggregation validates IDs and counts against the authorized day', async () => {
  const connection = { query: async () => [today] };
  const policy = () => ({ maxScore: 100, passingScore: 50, mistakeDeduction: 10, warningDeduction: 5 });
  const payload = { taskIds: [1, 2, 3], mistakeCount: 1, warningCount: 0 };
  const outcome = await loadRecitationGroupEvaluation(connection, today[0], payload, policy, async () => 1, 'count', null, { mistakeCount: 1, warningCount: 0 });
  assert.equal(outcome.completed, true);
  assert.equal(outcome.evaluatedFaces, 3);
  await assert.rejects(loadRecitationGroupEvaluation(connection, today[0], { ...payload, taskIds: [1, 10] }, policy, async () => 1), { statusCode: 422 });
  await assert.rejects(loadRecitationGroupEvaluation(connection, today[1], payload, policy, async () => 1, 'count', null, { mistakeCount: 1, warningCount: 0 }), { statusCode: 422 });
  const shortened = await loadRecitationGroupEvaluation(connection, today[0], { ...payload, taskIds: [1] }, policy, async () => 0.5);
  assert.equal(shortened.evaluatedFaces, 0.5);
});
