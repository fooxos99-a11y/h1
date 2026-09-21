const fail = (message) => Object.assign(new Error(message), { status: 422 });
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T12:00:00Z`))
  && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;

export async function buildStudentPointsReport(connection, { from, to, committeeId = 'all', auth, sourceLabel }) {
  if (!validDate(from) || !validDate(to) || from > to) throw fail('نطاق التاريخ غير صحيح.');
  if ((Date.parse(to) - Date.parse(from)) / 86400000 >= 370) throw fail('اختر نطاقاً لا يتجاوز سنة واحدة.');
  const filters = [];
  const params = [from, to];
  if (String(committeeId) !== 'all') {
    if (!Number.isSafeInteger(Number(committeeId)) || Number(committeeId) <= 0) throw fail('الحلقة غير صحيحة.');
    filters.push('s.committee_id = ?');
    params.push(Number(committeeId));
  }
  if (auth?.role === 'supervisor') {
    filters.push(`EXISTS (SELECT 1 FROM supervisor_committees sc
      WHERE sc.supervisor_id = ? AND sc.committee_id = s.committee_id)`);
    params.push(auth.id);
  }
  const [rows] = await connection.query(`SELECT s.id AS studentId, s.name AS studentName,
      c.name AS committeeName, s.points AS balance, t.id, t.transaction_type AS type,
      t.points, t.reason, t.source_type AS sourceType,
      DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS transactionDate,
      COALESCE(t.actor_name, sp.name, 'النظام') AS actorName
    FROM students s
    LEFT JOIN committees c ON c.id = s.committee_id
    LEFT JOIN student_point_transactions t ON t.student_id = s.id AND t.transaction_date BETWEEN ? AND ?
    LEFT JOIN supervisors sp ON sp.id = t.supervisor_id
    ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
    ORDER BY s.id, t.transaction_date DESC, t.id DESC`, params);
  const students = new Map();
  for (const row of rows) {
    if (!students.has(row.studentId)) students.set(row.studentId, {
      studentId: row.studentId, studentName: row.studentName, committeeName: row.committeeName,
      balance: Number(row.balance || 0), increases: 0, deductions: 0, total: 0, transactions: [],
    });
    if (row.id == null) continue;
    const student = students.get(row.studentId);
    const points = Number(row.points || 0);
    student[row.type === 'deduction' ? 'deductions' : 'increases'] += points;
    student.total = student.increases - student.deductions;
    student.transactions.push({ id: row.id, type: row.type, points, reason: row.reason,
      date: row.transactionDate, source: sourceLabel(row.sourceType), actorName: row.actorName });
  }
  return { period: { from, to }, rows: [...students.values()] };
}
