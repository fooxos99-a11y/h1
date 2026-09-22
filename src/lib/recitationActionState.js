export function isRecitationActionPending(task) {
  if (task.locallySaved || [true, 1].includes(task.teacherCompleted)) return false;
  if (task.nazemManaged) {
    return !task.nazemSubmissionLocked && ((Number(task.attemptCount) || 0) <= 0);
  }
  return ![true, 1].includes(task.teacherCompleted);
}

export function shouldShowRecitationStudent(student, tasks = [], taskQueue = []) {
  if (!['present', 'late'].includes(student.attendanceStatus)) return true;
  const remaining = tasks.some((task) => (
    Number(task.studentId) === Number(student.studentId) && isRecitationActionPending(task)
  ));
  if (remaining) return true;
  const saved = student.recitationFinished || student.recitationPending || student.recitationSyncFailed
    || [...tasks, ...taskQueue].some((task) => Number(task.studentId) === Number(student.studentId)
      && !isRecitationActionPending(task));
  return !saved;
}
