// A successful plan import does not prove that an old recitation was delivered.
// Verify its original follow-up date before returning it to the existing guarded sender.
export async function revalidatePendingNazemIdentity(connection, adapter, link) {
  const [jobs] = await connection.query(
    `SELECT job.id, JSON_UNQUOTE(JSON_EXTRACT(job.payload_json, '$.taskDate')) AS taskDate
     FROM nazem_sync_jobs job
     JOIN student_quran_recitation_attempts attempt
       ON attempt.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(job.payload_json, '$.attemptId')) AS UNSIGNED)
       AND attempt.is_official = 1
     JOIN student_quran_tasks task ON task.id = attempt.task_id
       AND task.plan_id = ? AND task.student_id = ?
     WHERE job.teacher_id = ? AND job.student_id = ? AND job.operation_type = 'recitation.submit'
       AND job.status = 'requires_review' AND job.last_error_code = 'NAZEM_PLAN_STUDENT_MISMATCH'
     ORDER BY attempt.session_date, job.id LIMIT 10`,
    [link.planId, link.studentId, link.teacherId, link.studentId],
  );
  const verifiedDates = new Set();
  let scheduled = 0;
  for (const job of jobs) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(job.taskDate || '')) continue;
    if (!verifiedDates.has(job.taskDate)) {
      await adapter.readStudentFollowUp(link, link, job.taskDate, { fresh: true });
      verifiedDates.add(job.taskDate);
    }
    const [result] = await connection.query(
      `UPDATE nazem_sync_jobs SET status = 'pending', attempt_count = 0, next_attempt_at = NOW(3),
         lease_owner = NULL, lease_expires_at = NULL, last_heartbeat_at = NULL,
         last_error_code = NULL, last_error = NULL, updated_at = NOW(3)
       WHERE id = ? AND status = 'requires_review' AND last_error_code = 'NAZEM_PLAN_STUDENT_MISMATCH'`, [job.id],
    );
    scheduled += Number(result.affectedRows || 0);
  }
  return scheduled;
}
