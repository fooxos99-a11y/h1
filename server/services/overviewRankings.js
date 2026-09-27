// Rankings of the statistics page: best students and circles by the points earned in the period, and each teacher's indicators.

const number = (value) => Number(value || 0);
const percentage = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar');
const SIGNED_POINTS = `CASE WHEN t.transaction_type = 'deduction' THEN -t.points ELSE t.points END`;
const RANKING_SIZE = 10;

/**
 * @param reportDb scoped report connection (createOverviewReportScope)
 * @param {{ from: string, to: string, attendanceDates: string[], attendanceWeekDays: number[], committeeIndicators: object[] }} period
 */
export async function buildOverviewRankings(reportDb, { from, to, attendanceDates = [], attendanceWeekDays = [], committeeIndicators = [] }) {
  const [studentRows] = await reportDb.query(
    `SELECT s.id, s.name, c.name AS committeeName, COALESCE(SUM(${SIGNED_POINTS}), 0) AS points
     FROM student_point_transactions t
     JOIN students s ON s.id = t.student_id
     LEFT JOIN committees c ON c.id = s.committee_id
     WHERE t.transaction_date BETWEEN ? AND ? AND ${reportDb.student('t.student_id')}
     GROUP BY s.id, s.name, c.name
     HAVING points > 0`,
    [from, to],
  );
  const bestStudents = studentRows
    .map((row) => ({ id: number(row.id), name: row.name, committeeName: row.committeeName || '', points: number(row.points) }))
    .sort((a, b) => b.points - a.points || byName(a, b))
    .slice(0, RANKING_SIZE);

  const [committeeRows] = await reportDb.query(
    `SELECT c.id, c.name, COUNT(DISTINCT s.id) AS studentsCount, COALESCE(SUM(${SIGNED_POINTS}), 0) AS points
     FROM committees c
     JOIN students s ON s.committee_id = c.id
     LEFT JOIN student_point_transactions t
       ON t.student_id = s.id AND t.transaction_date BETWEEN ? AND ?
     WHERE ${reportDb.committee('c.id')}
     GROUP BY c.id, c.name`,
    [from, to],
  );
  // Circles are compared by the average points of their students, so a large circle is not favoured.
  const bestCommittees = committeeRows
    .map((row) => {
      const studentsCount = number(row.studentsCount);
      const points = number(row.points);
      return { id: number(row.id), name: row.name, studentsCount, points, average: studentsCount ? Math.round((points / studentsCount) * 10) / 10 : 0 };
    })
    .filter((row) => row.points > 0)
    .sort((a, b) => b.average - a.average || byName(a, b))
    .slice(0, RANKING_SIZE);

  const [teacherRows] = await reportDb.query(
    `SELECT sp.id, sp.name, GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR '، ') AS committees,
       GROUP_CONCAT(DISTINCT c.id) AS committeeIds
     FROM supervisors sp
     LEFT JOIN supervisor_committees sc ON sc.supervisor_id = sp.id
     LEFT JOIN committees c ON c.id = sc.committee_id
     WHERE sp.role = 'supervisor' AND sp.is_active = 1 AND ${reportDb.staff('sp.id')}
     GROUP BY sp.id, sp.name`,
  );
  const dayPlaceholders = attendanceWeekDays.map(() => '?').join(', ');
  const [attendanceRows] = attendanceDates.length && attendanceWeekDays.length
    ? await reportDb.query(
      `SELECT ar.supervisor_id AS teacherId,
         COALESCE(SUM(ar.status IN ('present', 'late', 'excused')), 0) AS attended,
         COALESCE(SUM(ar.status = 'late'), 0) AS late,
         COALESCE(SUM(ar.status = 'absent'), 0) AS absent
       FROM supervisor_attendance_records ar
       WHERE ar.record_date BETWEEN ? AND ? AND ${reportDb.staff('ar.supervisor_id')}
         AND (DAYOFWEEK(ar.record_date) - 1) IN (${dayPlaceholders})
       GROUP BY ar.supervisor_id`,
      [from, to, ...attendanceWeekDays],
    )
    : [[]];
  const attendanceById = new Map(attendanceRows.map((row) => [String(row.teacherId), row]));
  // A teacher's achievement is the plan completion of the students in the teacher's circles, weighted by students.
  const committeeById = new Map(committeeIndicators.map((committee) => [String(committee.id), committee]));
  const achievementOf = (ids = '') => {
    const committees = String(ids).split(',').map((id) => committeeById.get(id.trim())).filter(Boolean);
    const students = committees.reduce((total, committee) => total + number(committee.studentsCount), 0);
    const weighted = committees.reduce((total, committee) => total + number(committee.overallPercentage) * number(committee.studentsCount), 0);
    return students ? Math.round(weighted / students) : 0;
  };
  const expectedDays = attendanceDates.length;
  const teachers = teacherRows
    .map((row) => {
      const attendance = attendanceById.get(String(row.id)) || {};
      return {
        id: number(row.id),
        name: row.name,
        committees: row.committees || '',
        attendance: {
          attended: number(attendance.attended),
          late: number(attendance.late),
          absent: number(attendance.absent),
          expected: expectedDays,
          percentage: percentage(number(attendance.attended), expectedDays),
        },
        achievement: { percentage: achievementOf(row.committeeIds) },
      };
    })
    .sort((a, b) => b.achievement.percentage - a.achievement.percentage || byName(a, b));

  return { bestStudents, bestCommittees, teachers };
}
