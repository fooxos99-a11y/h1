import { getManualAttendancePoints, applyAttendancePointDelta, logStudentPointTransaction,
  syncStudentPointBalance, syncStudentFamilyPointsForAttendance } from './studentPoints.js';
import { applyPlatformPolicies, readPlatformPoliciesFromRows } from './platformSettingPolicies.js';

export async function loadAttendancePointSettings(connection) {
  const [rows] = await connection.query('SELECT setting_key, setting_value FROM app_settings');
  const values = Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
  return applyPlatformPolicies({
    attendancePoints: Number(values.attendancePoints || 1),
    manualLateAttendancePoints: Number(values.manualLateAttendancePoints || 0),
    excusedAttendancePoints: Number(values.excusedAttendancePoints || 0),
    maxDailyStudentPoints: Number(values.maxDailyStudentPoints || 0),
    studentPointsAddToFamily: values.studentPointsAddToFamily !== 'false',
    familyPointsAddToStudents: values.familyPointsAddToStudents !== 'false',
    familyPointsAddToAbsentStudents: values.familyPointsAddToAbsentStudents !== 'false',
  }, readPlatformPoliciesFromRows(rows));
}

// Caller owns the transaction. Lock the student first to serialize grants for the same day.
export async function saveAttendanceWithPoints(connection, {
  studentId, date, status, checkInTime = null, requestedPoints, awardNewPoints = true,
  actorRole = 'system', actorName = 'مزامنة ناظم',
  reason = status === 'late' ? 'نقاط التأخر' : status === 'excused' ? 'كيلومترات الاستئذان' : 'نقاط الحضور',
}, settings) {
  await connection.query('SELECT id FROM students WHERE id = ? FOR UPDATE', [studentId]);
  const [[previous]] = await connection.query(
    'SELECT status, points FROM attendance_records WHERE student_id = ? AND record_date = ? FOR UPDATE', [studentId, date],
  );
  const points = !awardNewPoints && !Number(previous?.points || 0)
    ? 0 : requestedPoints ?? getManualAttendancePoints(settings, status);
  const delta = points - Number(previous?.points || 0);
  if (delta) await applyAttendancePointDelta(connection, studentId, delta, settings, { date });
  await connection.query(`INSERT INTO attendance_records (student_id, record_date, status, check_in_time, points)
    VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status),
    check_in_time = VALUES(check_in_time), points = VALUES(points)`, [studentId, date, status, checkInTime, points]);
  await syncStudentFamilyPointsForAttendance(connection, studentId, date, status, settings, { actorRole, actorName });
  if (points > 0) {
    await logStudentPointTransaction(connection, { studentId, actorRole, actorName, type: 'increase', points,
      reason, date, sourceType: 'attendance', dedupeKey: `attendance:${studentId}:${date}` });
  } else {
    await connection.query(`DELETE FROM student_point_transactions WHERE student_id = ? AND transaction_date = ?
      AND transaction_type = 'increase' AND source_type = 'attendance'`, [studentId, date]);
    await syncStudentPointBalance(connection, studentId);
  }
  return { previous: previous || null, points };
}
