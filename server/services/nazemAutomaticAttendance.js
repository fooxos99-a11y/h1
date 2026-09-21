import { saveAttendanceWithPoints } from './attendancePoints.js';
import { enqueueNazemAttendance } from '../integrations/nazem/queue.js';

export async function ensureNazemAutomaticAttendance(connection, {
  enabled, students, attendanceByStudent, date, today, actor, settings,
}, { saveAttendance = saveAttendanceWithPoints, enqueueAttendance = enqueueNazemAttendance } = {}) {
  if (!enabled || date !== today || actor?.role !== 'supervisor' || !settings.nazemIntegrationEnabled) return [];
  const added = [];
  for (const student of students) {
    const studentId = Number(student.id);
    if (!Number(student.nazemManaged) || attendanceByStudent.has(studentId)) continue;
    await connection.beginTransaction();
    try {
      // Use the same lock as manual attendance and Nazem imports; never replace an existing status.
      await connection.query('SELECT id FROM students WHERE id = ? FOR UPDATE', [studentId]);
      const [[previous]] = await connection.query(
        'SELECT id, status FROM attendance_records WHERE student_id = ? AND record_date = ? FOR UPDATE', [studentId, date],
      );
      if (previous) {
        await connection.commit();
        attendanceByStudent.set(studentId, previous.status);
        continue;
      }
      await saveAttendance(connection, {
        studentId, date, status: 'present', actorRole: 'system', actorName: 'التحضير التلقائي',
      }, settings);
      const [[record]] = await connection.query(
        'SELECT id FROM attendance_records WHERE student_id = ? AND record_date = ?', [studentId, date],
      );
      await enqueueAttendance(connection, {
        attendanceId: record.id, studentId, date, status: 'present', actor, explicitChange: false,
      });
      await connection.commit();
      attendanceByStudent.set(studentId, 'present');
      added.push(studentId);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }
  return added;
}
