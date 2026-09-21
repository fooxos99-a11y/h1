export function studentSessionResult(task) {
  if (task.teacherCompleted == null) return { label: 'بانتظار التقييم', tone: 'pending' };
  const completed = task.teacherCompleted === true || task.teacherCompleted === 1;
  const mistakes = Math.max(0, Number(task.mistakeCount) || 0);
  const warnings = Math.max(0, Number(task.warningCount) || 0);
  if (mistakes || warnings) return { label: [mistakes && `${mistakes} أخطاء`, warnings && `${warnings} تنبيهات`].filter(Boolean).join('، '), tone: 'mistakes' };
  return completed ? { label: 'متقن', tone: 'completed' } : { label: 'لم يكمل', tone: 'incomplete' };
}
