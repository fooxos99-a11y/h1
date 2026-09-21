import { reviewNazemError } from './errors.js';

export async function findNazemLateSourceDate(connection, { teacherId, externalPlanId, studentLink, remoteType, sourceDayId }) {
  const [rows] = await connection.query(
    `SELECT DISTINCT DATE_FORMAT(day.follow_up_date, '%Y-%m-%d') AS date
     FROM nazem_daily_follow_up_links day
     JOIN nazem_plan_links plan ON plan.teacher_id = day.teacher_id
       AND plan.ruwasi_plan_id = day.ruwasi_plan_id AND plan.ruwasi_student_id = day.ruwasi_student_id
     JOIN nazem_student_links student ON student.teacher_id = day.teacher_id
       AND student.ruwasi_student_id = day.ruwasi_student_id
     WHERE day.teacher_id = ? AND plan.nazem_plan_id = ? AND student.nazem_student_id = ?
       AND plan.sync_status NOT IN ('deleted','detached') AND student.status = 'linked'
       AND day.task_type = ? AND day.track = ?
       AND (JSON_UNQUOTE(JSON_EXTRACT(day.remote_snapshot, '$.id')) = ?
         OR JSON_UNQUOTE(JSON_EXTRACT(day.remote_snapshot, '$.source_day_id')) = ?)
     LIMIT 2`,
    [teacherId, String(externalPlanId), String(studentLink.nazemStudentId),
      remoteType === 'revision' ? 'review' : 'memorization', remoteType === 'master' ? 'mastery' : 'memorization',
      String(sourceDayId), String(sourceDayId)],
  );
  if (rows.length > 1) throw reviewNazemError('تعذرت مطابقة تاريخ الإكمال المتأخر مع يومه الأصلي.', 'NAZEM_LATE_SOURCE_AMBIGUOUS');
  return rows[0]?.date || null;
}
