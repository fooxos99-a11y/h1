const newestFirst = (first, second) => String(second.createdAt || '').localeCompare(String(first.createdAt || ''));
export function groupNazemLogEntries(entries = []) {
  const groups = new Map();
  for (const entry of entries) {
    const session = entry.studentId && entry.teacherId && entry.taskDate
      && ['recitation.submit', 'attendance.submit'].includes(entry.operationType);
    const key = session
      ? JSON.stringify([entry.teacherId, entry.studentId, entry.planId || '', entry.taskDate])
      : `job:${entry.jobId || entry.id}`;
    if (!groups.has(key)) groups.set(key, { key, studentName: entry.studentName, teacherName: entry.teacherName, date: session ? entry.taskDate : '', entries: [], history: [] });
    const group = groups.get(key);
    (entry.entryKind === 'current' ? group.entries : group.history).push(entry);
  }
  return [...groups.values()].map(group => {
    const entries = group.entries.sort(newestFirst);
    const history = group.history.sort(newestFirst);
    const latestEntry = [...entries, ...history].sort(newestFirst)[0];
    return { ...group, entries, history, latestEntry, latestAt: latestEntry?.createdAt || '' };
  }).sort((first, second) => second.latestAt.localeCompare(first.latestAt));
}
