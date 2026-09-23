// Missing amounts alone are not evidence of completion. Require a completed
// remote record for the selected date and reject any unfinished remote record.
export async function loadNazemCompletedStudentIds(connection, teacherId, date) {
  const [rows] = await connection.query(
    `SELECT followUp.ruwasi_student_id AS studentId,
       JSON_UNQUOTE(JSON_EXTRACT(followUp.remote_snapshot, '$.status')) AS status
     FROM nazem_daily_follow_up_links followUp
     JOIN nazem_plan_links planLink ON planLink.ruwasi_plan_id = followUp.ruwasi_plan_id
       AND planLink.ruwasi_student_id = followUp.ruwasi_student_id
       AND planLink.teacher_id = ? AND planLink.sync_status NOT IN ('deleted','detached')
     WHERE followUp.teacher_id = ? AND followUp.follow_up_date = ?
       AND followUp.remote_snapshot IS NOT NULL`,
    [teacherId, teacherId, date],
  );
  const completed = new Set(rows.map(row => Number(row.studentId)));
  for (const row of rows) {
    if (!['completed', 'completed_early', 'completed_late'].includes(String(row.status || '').toLowerCase())) {
      completed.delete(Number(row.studentId));
    }
  }
  return completed;
}
