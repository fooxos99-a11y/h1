// Called only after a successful, identity-checked login. Keep original targets
// and receipts; the normal worker still validates each operation before writing.
export async function recoverNazemAuthenticationJobs(connection, teacherId) {
  const [result] = await connection.query(`UPDATE nazem_sync_jobs
    SET status = 'pending', next_attempt_at = NOW(3),
      max_attempts = GREATEST(max_attempts, attempt_count + 2),
      payload_json = JSON_SET(payload_json, '$.authenticationRecoveryAt', DATE_FORMAT(NOW(3), '%Y-%m-%d %H:%i:%s.%f')),
      progress_stage = 'authentication-recovered', lease_owner = NULL, lease_expires_at = NULL
    WHERE teacher_id = ? AND operation_type IN ('attendance.submit','recitation.submit')
      AND status IN ('failed','requires_review')
      AND last_error_code IN ('NAZEM_LOGIN_FAILED','NAZEM_SESSION_EXPIRED')
      AND JSON_EXTRACT(payload_json, '$.authenticationRecoveryAt') IS NULL
    ORDER BY id LIMIT 20`, [teacherId]);
  return Number(result.affectedRows || 0);
}
