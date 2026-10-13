const failedLabels = {
  memorization: 'لم يتم الحفظ',
  review: 'لم تتم المراجعة',
  link: 'لم يتم الربط',
  mastery: 'لم يتم الإتقان',
};

/** Keep the latest attempt for each task, then the latest dated result for each track. */
export function attachRecitationOutcomes(students, receipts = []) {
  const latestTasks = new Map();
  for (const receipt of receipts) {
    if (![true, false, 0, 1].includes(receipt.teacherCompleted)) continue;
    const previous = latestTasks.get(Number(receipt.taskId));
    if (!previous || String(receipt.evaluatedAt || '').localeCompare(String(previous.evaluatedAt || '')) > 0
      || (receipt.evaluatedAt === previous.evaluatedAt && Number(receipt.attemptId || 0) > Number(previous.attemptId || 0))) {
      latestTasks.set(Number(receipt.taskId), receipt);
    }
  }
  const byStudent = new Map();
  for (const receipt of latestTasks.values()) {
    const studentId = Number(receipt.studentId);
    if (!byStudent.has(studentId)) byStudent.set(studentId, new Map());
    const groups = byStudent.get(studentId);
    const key = `${receipt.taskType}:${receipt.track || 'memorization'}`;
    const current = groups.get(key);
    if (current && current.taskDate > receipt.taskDate) continue;
    const passed = [true, 1].includes(receipt.teacherCompleted);
    const outcome = current?.taskDate === receipt.taskDate ? current : {
      taskType: receipt.taskType, track: receipt.track || 'memorization', taskDate: receipt.taskDate,
      teacherCompleted: true,
    };
    outcome.teacherCompleted &&= passed;
    outcome.label = outcome.teacherCompleted ? ''
      : failedLabels[outcome.track === 'mastery' && outcome.taskType === 'memorization' ? 'mastery' : outcome.taskType] || '';
    groups.set(key, outcome);
  }
  return students.map(student => {
    const recitationOutcomes = [...(byStudent.get(Number(student.studentId))?.values() || [])];
    if (!recitationOutcomes.length) return student.recitationOutcomes ? { ...student, recitationOutcomes } : student;
    return { ...student, recitationOutcomes,
      ...(recitationOutcomes.some(outcome => !outcome.teacherCompleted) ? { recitationFinished: false } : {}),
    };
  });
}
