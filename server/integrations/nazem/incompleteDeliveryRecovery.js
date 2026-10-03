const parse = value => typeof value === 'string' ? JSON.parse(value) : value;

export function incompleteDeliveryRecoveryKey(row) {
  const payload = parse(row.payload), remote = parse(row.remote);
  const source = payload?.submissionTarget?.source;
  const accepted = (payload?.deliveryWrites || []).filter(write => write.acceptedAt && !write.rejectedAt
    && /^\/educational-plans\/item-days\/\d+\/not-completed$/.test(write.path));
  if (payload?.taskType !== 'memorization' || row.attemptCompleted == null || Number(row.attemptCompleted) !== 0
    || !source?.id || accepted.length !== 1 || !remote?.nazemLate || remote.status !== 'pending'
    || String(source.date || '').slice(0, 10) !== payload.taskDate
    || String(remote.date || '').slice(0, 10) !== payload.taskDate
    || !['surah_from', 'verse_from', 'surah_to', 'verse_to'].every(key => Number(source[key]) > 0 && Number(source[key]) === Number(remote[key]))) return null;
  const acceptedId = /^\/educational-plans\/item-days\/(\d+)\//.exec(accepted[0].path)[1];
  if (String(remote.source_day_id) !== acceptedId) return null;
  const key = `${acceptedId}:${remote.id}:${payload.taskDate}`;
  return payload.incompleteDeliveryRecoveryKey === key ? null : key;
}

// Called only after a fresh, verified follow-up import. Reawaken accepted writes
// for verification, never replace an evaluation or discard its delivery journal.
export async function wakeAcceptedIncompleteNazemDay(connection, { teacherId, studentId, planId }) {
  const [rows] = await connection.query(`SELECT job.id, job.payload_json AS payload,
    daily.remote_snapshot AS remote, attempt.teacher_completed AS attemptCompleted
    FROM nazem_sync_jobs job
    JOIN nazem_daily_follow_up_links daily ON daily.id = job.entity_id AND job.entity_type = 'recitation_day'
    JOIN student_quran_recitation_attempts attempt ON attempt.id = JSON_EXTRACT(job.payload_json, '$.attemptId')
      AND attempt.student_id = job.student_id AND attempt.is_official = 1
    JOIN student_quran_tasks task ON task.id = attempt.task_id AND task.plan_id = daily.ruwasi_plan_id
    WHERE job.teacher_id = ? AND job.student_id = ? AND daily.ruwasi_plan_id = ?
      AND job.operation_type = 'recitation.submit' AND job.status IN ('requires_review','failed')
      AND job.last_error_code = 'NAZEM_DELIVERY_UNVERIFIED'
      AND NOT EXISTS (SELECT 1 FROM student_quran_recitation_attempts newer WHERE newer.task_id = task.id
        AND newer.is_official = 1 AND (newer.attempt_number > attempt.attempt_number
          OR (newer.attempt_number = attempt.attempt_number AND newer.id > attempt.id)))`, [teacherId, studentId, planId]);
  let count = 0;
  for (const row of rows) {
    const key = incompleteDeliveryRecoveryKey(row);
    if (!key) continue;
    const [result] = await connection.query(`UPDATE nazem_sync_jobs SET status = 'pending', next_attempt_at = NOW(3),
      max_attempts = GREATEST(max_attempts, attempt_count + 2), lease_owner = NULL, lease_expires_at = NULL,
      last_heartbeat_at = NULL, progress_stage = 'verify-accepted-incomplete',
      payload_json = JSON_SET(payload_json, '$.incompleteDeliveryRecoveryKey', ?)
      WHERE id = ? AND status IN ('requires_review','failed') AND last_error_code = 'NAZEM_DELIVERY_UNVERIFIED'
      AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.incompleteDeliveryRecoveryKey')), '') <> ?`, [key, row.id, key]);
    count += Number(result.affectedRows || 0);
  }
  return count;
}
