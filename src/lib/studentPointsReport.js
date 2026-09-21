export function filterStudentPoints(rows, search = '', sort = 'points_desc') {
  const query = search.trim();
  const nameOrder = (a, b) => a.studentName.localeCompare(b.studentName, 'ar') || Number(a.studentId) - Number(b.studentId);
  const comparators = {
    name: nameOrder,
    points_desc: (a, b) => b.total - a.total || nameOrder(a, b),
    points_asc: (a, b) => a.total - b.total || nameOrder(a, b),
    committee: (a, b) => (a.committeeName || '').localeCompare(b.committeeName || '', 'ar') || nameOrder(a, b),
  };
  return rows.filter((row) => !query || row.studentName.includes(query) || (row.committeeName || '').includes(query))
    .sort(comparators[sort] || comparators.points_desc);
}
