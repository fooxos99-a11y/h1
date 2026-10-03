import { BUSINESS_DAY_START_TIME, getBusinessDateTimeParts, shiftDateOnly } from '../../shared/business-date.js';

export function studentAttendanceCutoff(to, settings, now = getBusinessDateTimeParts()) {
  const beforeSession = now.time >= BUSINESS_DAY_START_TIME
    && now.time < String(settings.attendanceStartTime || BUSINESS_DAY_START_TIME);
  const elapsedTo = beforeSession ? shiftDateOnly(now.date, -1) : now.date;
  return to < elapsedTo ? to : elapsedTo;
}

/** A recorded attendance date is evidence of participation; an import timestamp is not. */
export function studentAttendanceWindow(rows, { from, to, weekdays }) {
  const firstDates = rows.map(row => row.firstAttendanceDate).filter(Boolean);
  const first = firstDates.sort()[0];
  const start = first && first > from ? first : from;
  const dates = [];
  if (first) {
    for (let date = start; date && date <= to; date = shiftDateOnly(date, 1)) {
      if (weekdays.includes(new Date(`${date}T12:00:00Z`).getUTCDay())) dates.push(date);
    }
  }
  const expectedByStudent = new Map(rows.map(row => [String(row.studentId), row.firstAttendanceDate
    ? dates.filter(date => date >= row.firstAttendanceDate).length : 0]));
  return { dates, expectedByStudent, totalExpected: [...expectedByStudent.values()].reduce((total, count) => total + count, 0), from: start, to };
}

export async function loadOverviewStudentAttendanceWindow(reportDb, { from, to, settings, weekdays, now }) {
  const cutoff = studentAttendanceCutoff(to, settings, now);
  const [rows] = await reportDb.query(
    `SELECT s.id AS studentId, DATE_FORMAT(MIN(ar.record_date), '%Y-%m-%d') AS firstAttendanceDate
     FROM students s
     LEFT JOIN attendance_records ar ON ar.student_id = s.id AND ar.record_date <= ?
     WHERE ${reportDb.student('s.id')}
     GROUP BY s.id`,
    [cutoff],
  );
  return studentAttendanceWindow(rows, { from, to: cutoff, weekdays });
}
