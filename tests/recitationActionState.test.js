import { advanceRecitationTaskQueue } from '../src/lib/recitationTaskQueue.js';
import { mergeCommittedOfflineEvaluation } from '../src/lib/offlineEvaluationMerge.js';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { isRecitationActionPending, shouldShowRecitationStudent } from '../src/lib/recitationActionState.js';

test('saved Nazem outcomes stay hidden regardless of passing score or background synchronization', () => {
  for (const teacherCompleted of [true, false, 0, 1]) {
    assert.equal(isRecitationActionPending({ nazemManaged: true, attemptCount: 1, teacherCompleted }), false);
  }
  assert.equal(isRecitationActionPending({ nazemManaged: true, nazemSubmissionLocked: true }), false);
});
test('finishing one dated task does not hide a different task or change ordinary retries', () => {
  const tasks = [{ id: 1, taskDate: '2026-09-06', nazemManaged: true, attemptCount: 1 },
    { id: 2, taskDate: '2026-09-07', nazemManaged: true, attemptCount: 0 }];
  assert.deepEqual(tasks.filter(isRecitationActionPending).map(t => t.id), [2]);
  assert.equal(isRecitationActionPending({ teacherCompleted: false }), true);
  assert.equal(isRecitationActionPending({ teacherCompleted: true }), false);
});

const student = { studentId: 8, attendanceStatus: 'present', recitationPending: true };
const task = { id: 1, studentId: 8, planId: 17, taskType: 'memorization', track: 'memorization', taskDate: '2026-09-06', nazemManaged: true };
test('marking attendance retains a student whose Nazem amount is missing or still loading', () => {
  for (const refreshState of [{ amountRefreshPending: true }, { amountRefreshFailed: true }, {}]) {
    const evaluation = { date: '2026-09-08', tasks: [], students: [{ studentId: 13, nazemManaged: true, attendanceStatus: '', ...refreshState }] };
    const result = mergeCommittedOfflineEvaluation(evaluation, [], [{ status: 'pending', actionType: 'student_attendance', payload: { date: evaluation.date, studentId: 13, status: 'present' } }]);
    assert.equal(result.students.length, 1);
    assert.equal(result.students[0].attendanceStatus, 'present');
    assert.equal(shouldShowRecitationStudent(result.students[0]), true);
  }
});
test('hide a saved student during sync and after acknowledgement, but keep unfinished attendance and tasks', () => {
  assert.equal(shouldShowRecitationStudent(student), false);
  assert.equal(shouldShowRecitationStudent({ ...student, recitationPending: false, recitationFinished: true }), false);
  assert.equal(shouldShowRecitationStudent({ ...student, attendanceStatus: '' }), true);
  assert.equal(shouldShowRecitationStudent(student, [task]), true);
  assert.equal(shouldShowRecitationStudent(student, [], [{ ...task, nazemLate: true }]), false);
  assert.equal(shouldShowRecitationStudent({ ...student, nazemRemainingDue: [task] }), false);
  assert.equal(shouldShowRecitationStudent(student, [], [{ ...task, locallySaved: true }]), false);
});

test('local save and offline rehydration retain other overdue dates but remove the submitted due item', () => {
  for (const hasOverdue of [false, true]) {
    const later = { ...task, id: 2, taskDate: '2026-09-07' };
    const evaluation = { date: '2026-09-07', tasks: [task], taskQueue: hasOverdue ? [task, later] : [task],
      students: [{ ...student, nazemRemainingDue: hasOverdue ? [task, later] : [task] }] };
    const local = advanceRecitationTaskQueue(evaluation, [task], { promote: false });
    const hydrated = mergeCommittedOfflineEvaluation(evaluation, [{ status: 'pending', studentId: 8, sessionDate: evaluation.date, tasks: [{ taskId: 1 }] }]);
    for (const state of [local, hydrated]) {
      assert.equal(shouldShowRecitationStudent(state.students[0], state.tasks, state.taskQueue), false);
      assert.equal(state.students[0].nazemRemainingDue.length, hasOverdue ? 1 : 0);
    }
  }
});
test('negative-result button submits directly without a confirmation dialog', () => {
  const source = readFileSync(new URL('../src/components/portal/TeacherEvaluationDialog.jsx', import.meta.url), 'utf8');
  assert.match(source, /onClick=\{\(\) => void markNotMemorized\(selectedStudent\)\}/);
  assert.doesNotMatch(source, /RecitationNotCompletedDialog|notCompletedStudent/);
});

test('remaining Nazem work matches link outcomes separately from memorization', () => {
  const source = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  const dueQuery = source.slice(source.indexOf('const [nazemDueRows]'), source.indexOf('const nazemDueStudentIds'));
  assert.match(dueQuery, /dueTask.task_type = due.task_type/);
  assert.doesNotMatch(dueQuery, /CASE WHEN dueTask.task_type/);
  const link = { ...task, taskType: 'link' };
  const state = advanceRecitationTaskQueue({ tasks: [link], students: [{ ...student, nazemRemainingDue: [task, link] }] }, [link], { promote: false });
  assert.deepEqual(state.students[0].nazemRemainingDue, [task]);
});
