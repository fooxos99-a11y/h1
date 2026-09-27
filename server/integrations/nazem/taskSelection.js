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
  }
  const earliestDateByGroup = new Map();
  const earliestLateByGroup = new Map();
  const keepEarliest = (dates, key, date) => {
    const current = dates.get(key);
    if (!current || date < current) dates.set(key, date);
  };
  rows.forEach((row) => {
    if (!Number(row.nazemManaged)) return;
    const key = taskGroupKey(row);
    const date = String(row.taskDate || '');
    keepEarliest(earliestDateByGroup, key, date);
    if (Number(row.nazemLate) && row.taskType === 'memorization') keepEarliest(earliestLateByGroup, key, date);
  });
  // A known open late always comes before the saved authority date: Nazem takes lates first.
  const actionableDate = (row) => {
    const key = taskGroupKey(row);
    if (row.taskType === 'link' || !authoritativeDates.has(key)) return earliestDateByGroup.get(key);
    const authorityDate = authoritativeDates.get(key);
    const lateDate = earliestLateByGroup.get(key);
    return lateDate && (!authorityDate || lateDate < authorityDate) ? lateDate : authorityDate;
  };
  return rows.filter((row) => !Number(row.nazemManaged) || String(row.taskDate || '') === actionableDate(row));
}
