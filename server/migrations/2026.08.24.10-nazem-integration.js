export const version = '2026.08.24.10';

export async function up(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS nazem_accounts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    teacher_id BIGINT UNSIGNED NOT NULL,
    encrypted_username TEXT NOT NULL,
    encrypted_password TEXT NOT NULL,
    encrypted_session_state MEDIUMTEXT NULL,
    external_teacher_name VARCHAR(180) NULL,
    external_organization_name VARCHAR(180) NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'pending',
    last_verified_at DATETIME(3) NULL,
    last_successful_login_at DATETIME(3) NULL,
    last_error_code VARCHAR(80) NULL,
    last_error VARCHAR(500) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY nazem_accounts_teacher_unique (teacher_id),
    CONSTRAINT nazem_accounts_teacher_fk FOREIGN KEY (teacher_id) REFERENCES supervisors(id)
      ON UPDATE CASCADE ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await connection.query(`CREATE TABLE IF NOT EXISTS nazem_student_links (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    teacher_id BIGINT UNSIGNED NOT NULL,
    ruwasi_student_id BIGINT UNSIGNED NOT NULL,
    nazem_student_id VARCHAR(190) NULL,
    nazem_student_name VARCHAR(180) NOT NULL,
    external_organization_id VARCHAR(190) NULL,
    external_organization_name VARCHAR(180) NULL,
    external_circle_id VARCHAR(190) NULL,
    external_circle_name VARCHAR(180) NULL,
    match_confidence DECIMAL(5,4) NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'requires_review',
    last_verified_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY nazem_student_links_ruwasi_unique (teacher_id, ruwasi_student_id),
    UNIQUE KEY nazem_student_links_external_unique (teacher_id, nazem_student_id),
    INDEX nazem_student_links_status_lookup (teacher_id, status),
    CONSTRAINT nazem_student_links_teacher_fk FOREIGN KEY (teacher_id) REFERENCES supervisors(id)
      ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT nazem_student_links_student_fk FOREIGN KEY (ruwasi_student_id) REFERENCES students(id)
      ON UPDATE CASCADE ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await connection.query(`CREATE TABLE IF NOT EXISTS nazem_student_candidates (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    teacher_id BIGINT UNSIGNED NOT NULL,
    candidate_fingerprint CHAR(64) NOT NULL,
    nazem_student_id VARCHAR(190) NULL,
    nazem_student_name VARCHAR(180) NOT NULL,
    external_organization_id VARCHAR(190) NULL,
    external_organization_name VARCHAR(180) NULL,
    external_circle_id VARCHAR(190) NULL,
    external_circle_name VARCHAR(180) NULL,
    last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY nazem_student_candidates_unique (teacher_id, candidate_fingerprint),
    INDEX nazem_student_candidates_external_lookup (teacher_id, nazem_student_id),
    CONSTRAINT nazem_student_candidates_teacher_fk FOREIGN KEY (teacher_id) REFERENCES supervisors(id)
      ON UPDATE CASCADE ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await connection.query(`CREATE TABLE IF NOT EXISTS nazem_plan_links (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ruwasi_plan_id BIGINT UNSIGNED NOT NULL,
    ruwasi_student_id BIGINT UNSIGNED NOT NULL,
    teacher_id BIGINT UNSIGNED NOT NULL,
    nazem_student_id VARCHAR(190) NULL,
    nazem_plan_id VARCHAR(190) NULL,
    external_fingerprint CHAR(64) NULL,
    sync_status VARCHAR(40) NOT NULL DEFAULT 'pending',
    last_synced_at DATETIME(3) NULL,
    last_remote_checked_at DATETIME(3) NULL,
    last_error_code VARCHAR(80) NULL,
    last_error VARCHAR(500) NULL,
    local_snapshot JSON NULL,
    remote_snapshot JSON NULL,
    last_synced_snapshot JSON NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY nazem_plan_links_ruwasi_unique (ruwasi_plan_id),
    UNIQUE KEY nazem_plan_links_external_unique (teacher_id, nazem_plan_id),
    INDEX nazem_plan_links_student_lookup (ruwasi_student_id, sync_status),
    CONSTRAINT nazem_plan_links_plan_fk FOREIGN KEY (ruwasi_plan_id) REFERENCES student_quran_plans(id)
      ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT nazem_plan_links_student_fk FOREIGN KEY (ruwasi_student_id) REFERENCES students(id)
      ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT nazem_plan_links_teacher_fk FOREIGN KEY (teacher_id) REFERENCES supervisors(id)
      ON UPDATE CASCADE ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await connection.query(`CREATE TABLE IF NOT EXISTS nazem_recitation_links (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ruwasi_recitation_id BIGINT UNSIGNED NOT NULL,
    ruwasi_task_id BIGINT UNSIGNED NOT NULL,
    ruwasi_plan_id BIGINT UNSIGNED NOT NULL,
    teacher_id BIGINT UNSIGNED NOT NULL,
    nazem_record_id VARCHAR(190) NULL,
    external_fingerprint CHAR(64) NOT NULL,
    sync_status VARCHAR(40) NOT NULL DEFAULT 'pending',
    last_synced_at DATETIME(3) NULL,
    last_error_code VARCHAR(80) NULL,
    last_error VARCHAR(500) NULL,
    local_snapshot JSON NULL,
    remote_snapshot JSON NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY nazem_recitation_links_ruwasi_unique (ruwasi_recitation_id),
    UNIQUE KEY nazem_recitation_links_external_unique (teacher_id, nazem_record_id),
    UNIQUE KEY nazem_recitation_links_fingerprint_unique (teacher_id, external_fingerprint),
    INDEX nazem_recitation_links_task_lookup (ruwasi_task_id, sync_status),
    CONSTRAINT nazem_recitation_links_attempt_fk FOREIGN KEY (ruwasi_recitation_id)
      REFERENCES student_quran_recitation_attempts(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT nazem_recitation_links_task_fk FOREIGN KEY (ruwasi_task_id)
      REFERENCES student_quran_tasks(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT nazem_recitation_links_plan_fk FOREIGN KEY (ruwasi_plan_id)
      REFERENCES student_quran_plans(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT nazem_recitation_links_teacher_fk FOREIGN KEY (teacher_id)
      REFERENCES supervisors(id) ON UPDATE CASCADE ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await connection.query(`CREATE TABLE IF NOT EXISTS nazem_sync_jobs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    sync_uuid CHAR(36) NOT NULL,
    idempotency_key VARCHAR(190) NOT NULL,
    operation_type VARCHAR(80) NOT NULL,
    entity_type VARCHAR(40) NOT NULL,
    entity_id BIGINT UNSIGNED NULL,
    teacher_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'pending',
    payload_json JSON NOT NULL,
    attempt_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    max_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 4,
    next_attempt_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    lease_owner VARCHAR(120) NULL,
    lease_expires_at DATETIME(3) NULL,
    last_error_code VARCHAR(80) NULL,
    last_error VARCHAR(500) NULL,
    last_started_at DATETIME(3) NULL,
    last_succeeded_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY nazem_sync_jobs_uuid_unique (sync_uuid),
    UNIQUE KEY nazem_sync_jobs_idempotency_unique (idempotency_key),
    INDEX nazem_sync_jobs_claim_lookup (status, next_attempt_at, lease_expires_at, id),
    INDEX nazem_sync_jobs_teacher_lookup (teacher_id, created_at),
    CONSTRAINT nazem_sync_jobs_teacher_fk FOREIGN KEY (teacher_id) REFERENCES supervisors(id)
      ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT nazem_sync_jobs_student_fk FOREIGN KEY (student_id) REFERENCES students(id)
      ON UPDATE CASCADE ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await connection.query(`CREATE TABLE IF NOT EXISTS nazem_sync_conflicts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    entity_type VARCHAR(40) NOT NULL,
    entity_id BIGINT UNSIGNED NOT NULL,
    teacher_id BIGINT UNSIGNED NOT NULL,
    local_snapshot JSON NOT NULL,
    remote_snapshot JSON NOT NULL,
    base_snapshot JSON NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'open',
    resolution VARCHAR(40) NULL,
    resolved_by_role VARCHAR(40) NULL,
    resolved_by_id BIGINT UNSIGNED NULL,
    resolved_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX nazem_sync_conflicts_lookup (status, created_at),
    CONSTRAINT nazem_sync_conflicts_teacher_fk FOREIGN KEY (teacher_id) REFERENCES supervisors(id)
      ON UPDATE CASCADE ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await connection.query(`CREATE TABLE IF NOT EXISTS nazem_sync_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    job_id BIGINT UNSIGNED NULL,
    teacher_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NULL,
    operation_type VARCHAR(80) NOT NULL,
    status VARCHAR(40) NOT NULL,
    attempt_number SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    error_code VARCHAR(80) NULL,
    message VARCHAR(500) NULL,
    metadata_json JSON NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX nazem_sync_events_log_lookup (status, created_at),
    INDEX nazem_sync_events_teacher_lookup (teacher_id, created_at),
    CONSTRAINT nazem_sync_events_job_fk FOREIGN KEY (job_id) REFERENCES nazem_sync_jobs(id)
      ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT nazem_sync_events_teacher_fk FOREIGN KEY (teacher_id) REFERENCES supervisors(id)
      ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT nazem_sync_events_student_fk FOREIGN KEY (student_id) REFERENCES students(id)
      ON UPDATE CASCADE ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await connection.query(`CREATE TABLE IF NOT EXISTS nazem_circuit_breakers (
    adapter_key VARCHAR(80) NOT NULL PRIMARY KEY,
    state VARCHAR(20) NOT NULL DEFAULT 'closed',
    consecutive_failures SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    window_failures SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    window_total SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    window_started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    opened_at DATETIME(3) NULL,
    retry_after DATETIME(3) NULL,
    last_error_code VARCHAR(80) NULL,
    last_error VARCHAR(500) NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

export async function down(connection) {
  const tables = [
    'nazem_sync_events',
    'nazem_sync_conflicts',
    'nazem_recitation_links',
    'nazem_plan_links',
    'nazem_student_links',
    'nazem_student_candidates',
    'nazem_sync_jobs',
    'nazem_circuit_breakers',
    'nazem_accounts',
  ];
  for (const table of tables) {
    await connection.query(`DROP TABLE IF EXISTS ${table}`);
  }
}
