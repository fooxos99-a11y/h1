const dailyTaskType = (taskType) => taskType;

const taskGroupKey = (row) => [
  Number(row.studentId),
  Number(row.planId),
  dailyTaskType(row.taskType),
  row.track || 'memorization',
].join(':');

export function selectNazemFirstActionableTasks(rows = [], authorities = []) {
  const authoritativeDates = new Map();
  for (const authority of authorities) {
    const key = taskGroupKey(authority);
    if (!authoritativeDates.has(key)) authoritativeDates.set(key, authority.taskDate);
    if (authority.taskType === 'memorization' && authority.track !== 'mastery') {
      const linkKey = taskGroupKey({ ...authority, taskType: 'link' });
      if (!authoritativeDates.has(linkKey)) authoritativeDates.set(linkKey, authority.linkDate);
    }
  }
  const earliestDateByGroup = new Map();
  rows.forEach((row) => {
    if (!Number(row.nazemManaged)) return;
    const key = taskGroupKey(row);
    const date = String(row.taskDate || '');
    const current = earliestDateByGroup.get(key);
    if (!current || date < current) earliestDateByGroup.set(key, date);
  });
  return rows.filter((row) => (
    !Number(row.nazemManaged)
    || String(row.taskDate || '') === (authoritativeDates.has(taskGroupKey(row))
      ? authoritativeDates.get(taskGroupKey(row)) : earliestDateByGroup.get(taskGroupKey(row)))
  ));
}
