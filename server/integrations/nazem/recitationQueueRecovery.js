export function latestRecitationJobSql(alias) {
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(alias)) throw new Error('Invalid queue alias');
  return `NOT EXISTS (
    SELECT 1 FROM nazem_sync_jobs newer
    WHERE newer.teacher_id = ${alias}.teacher_id AND newer.student_id = ${alias}.student_id
      AND newer.operation_type = ${alias}.operation_type AND newer.entity_type = ${alias}.entity_type
      AND newer.entity_id = ${alias}.entity_id AND newer.id > ${alias}.id
  )`;
}

// Retain the old evaluation and journal; retire only unsent queue entries replaced by a newer one.
export async function dismissSupersededNazemRecitations(connection) {
  const [result] = await connection.query(`UPDATE nazem_sync_jobs older
    JOIN nazem_sync_jobs newer ON newer.teacher_id = older.teacher_id
      AND newer.student_id = older.student_id AND newer.operation_type = older.operation_type
      AND newer.entity_type = older.entity_type AND newer.entity_id = older.entity_id AND newer.id > older.id
    SET older.status = 'dismissed', older.lease_owner = NULL, older.lease_expires_at = NULL,
      older.last_error_code = 'NAZEM_JOB_SUPERSEDED',
      older.last_error = 'استبدلت هذه العملية بتقييم أحدث للسجل نفسه؛ بقي التقييم السابق محفوظًا.'
    WHERE older.operation_type = 'recitation.submit'
      AND older.status IN ('pending','retrying','failed','blocked','requires_review','conflict')
      AND COALESCE(JSON_LENGTH(JSON_EXTRACT(older.payload_json, '$.deliveryWrites')), 0) = 0`);
  return Number(result.affectedRows || 0);
}

// A newer successful connection permits two more transport attempts, retaining the attempt history.
export async function recoverFailedNazemRecitations(connection, minutes) {
  const [result] = await connection.query(`UPDATE nazem_sync_jobs job
    LEFT JOIN nazem_sync_jobs newer ON newer.teacher_id = job.teacher_id AND newer.student_id = job.student_id
      AND newer.operation_type = job.operation_type AND newer.entity_type = job.entity_type
      AND newer.entity_id = job.entity_id AND newer.id > job.id
    LEFT JOIN nazem_recitation_links receipt ON receipt.teacher_id = job.teacher_id
      AND receipt.sync_status = 'synced' AND receipt.last_synced_at IS NOT NULL
      AND receipt.ruwasi_recitation_id = CAST(JSON_UNQUOTE(JSON_EXTRACT(job.payload_json, '$.attemptId')) AS UNSIGNED)
    LEFT JOIN nazem_sync_jobs healthy ON healthy.teacher_id = job.teacher_id
      AND healthy.status = 'synced' AND healthy.last_succeeded_at > job.updated_at
    SET job.status = 'retrying', job.next_attempt_at = NOW(3),
      job.max_attempts = GREATEST(job.max_attempts, job.attempt_count + IF(healthy.id IS NOT NULL, 2, 0)),
      job.lease_owner = NULL, job.lease_expires_at = NULL, job.updated_at = NOW(3)
    WHERE job.operation_type = 'recitation.submit' AND job.status = 'failed'
      AND (job.attempt_count < job.max_attempts OR healthy.id IS NOT NULL)
      AND job.last_error_code IN ('NAZEM_TRANSIENT','NAZEM_RECITATION_TIMEOUT','NAZEM_PLAN_API_TIMEOUT',
        'NAZEM_LOGIN_TIMEOUT','NAZEM_BROWSER_START_FAILED','NAZEM_LEASE_EXPIRED')
      AND job.updated_at <= DATE_SUB(NOW(3), INTERVAL ? MINUTE)
      AND newer.id IS NULL AND receipt.ruwasi_recitation_id IS NULL`,
  [Math.max(5, Number(minutes) || 15)]);
  return Number(result.affectedRows || 0);
}
