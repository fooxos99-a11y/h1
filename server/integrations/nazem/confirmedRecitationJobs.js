// Close only the queue entry whose exact saved attempt has a confirmed remote receipt.
export const confirmedRecitationJobSql = `EXISTS (
  SELECT 1 FROM nazem_recitation_links receipt
  JOIN student_quran_recitation_attempts attempt ON attempt.id = receipt.ruwasi_recitation_id
  WHERE receipt.ruwasi_recitation_id = CAST(JSON_UNQUOTE(JSON_EXTRACT(job.payload_json, '$.attemptId')) AS UNSIGNED)
    AND receipt.teacher_id = job.teacher_id AND attempt.evaluator_id = job.teacher_id
    AND attempt.student_id = job.student_id AND receipt.sync_status = 'synced'
    AND receipt.last_synced_at IS NOT NULL
    AND COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(receipt.remote_snapshot, '$.externalId')), ''),
                 NULLIF(JSON_UNQUOTE(JSON_EXTRACT(receipt.remote_snapshot, '$.id')), '')) REGEXP '^[1-9][0-9]*$'
    AND NOT EXISTS (SELECT 1 FROM nazem_recitation_links remaining
      WHERE remaining.daily_follow_up_id = receipt.daily_follow_up_id
        AND remaining.teacher_id = receipt.teacher_id AND remaining.sync_status <> 'synced')
)`;

export async function reconcileConfirmedRecitationJobs(connection, teacherId = null) {
  const [result] = await connection.query(`UPDATE nazem_sync_jobs job
    SET job.status = 'synced', job.last_error_code = NULL, job.last_error = NULL,
      job.lease_owner = NULL, job.lease_expires_at = NULL, job.last_heartbeat_at = NULL,
      job.updated_at = NOW(3), job.last_succeeded_at = NOW(3),
      job.progress_percent = 100, job.progress_stage = 'completed'
    WHERE job.operation_type = 'recitation.submit'
      AND job.status IN ('pending','retrying','blocked','failed','requires_review','conflict','syncing')
      AND (job.status <> 'syncing' OR job.lease_expires_at < NOW(3))
      ${teacherId == null ? '' : 'AND job.teacher_id = ?'}
      AND ${confirmedRecitationJobSql}`, teacherId == null ? [] : [teacherId]);
  return Number(result.affectedRows || 0);
}
