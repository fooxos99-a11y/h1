const trackOrder = { 'attendance.submit': 0, memorization: 1, mastery: 1, link: 2, review: 3 };
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
  return [...groups.values()].map(group => ({ ...group,
    entries: group.entries.sort((a, b) => (trackOrder[a.taskType || a.operationType] ?? 9) - (trackOrder[b.taskType || b.operationType] ?? 9)),
  }));
}
