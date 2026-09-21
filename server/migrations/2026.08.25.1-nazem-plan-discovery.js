export const version = '2026.08.25.1';

export async function up(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS nazem_plan_candidates (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    teacher_id BIGINT UNSIGNED NOT NULL,
    ruwasi_student_id BIGINT UNSIGNED NULL,
    nazem_student_id VARCHAR(190) NOT NULL,
    nazem_student_name VARCHAR(180) NOT NULL,
    nazem_plan_id VARCHAR(190) NOT NULL,
    remote_snapshot JSON NOT NULL,
    progress_snapshot JSON NULL,
    discovery_status VARCHAR(40) NOT NULL DEFAULT 'discovered',
    last_error_code VARCHAR(80) NULL,
    last_error VARCHAR(500) NULL,
    resolved_by_role VARCHAR(40) NULL,
    resolved_by_id BIGINT UNSIGNED NULL,
    resolved_at DATETIME(3) NULL,
    last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY nazem_plan_candidates_external_unique
      (teacher_id, nazem_student_id, nazem_plan_id),
    INDEX nazem_plan_candidates_review_lookup
      (teacher_id, discovery_status, last_seen_at),
    INDEX nazem_plan_candidates_student_lookup
      (ruwasi_student_id, discovery_status),
    CONSTRAINT nazem_plan_candidates_teacher_fk FOREIGN KEY (teacher_id)
      REFERENCES supervisors(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT nazem_plan_candidates_student_fk FOREIGN KEY (ruwasi_student_id)
      REFERENCES students(id) ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT nazem_plan_candidates_status_check CHECK (
      discovery_status IN ('discovered','requires_review','linked','imported','ignored','stale')
    )
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

export async function down(connection) {
  await connection.query('DROP TABLE IF EXISTS nazem_plan_candidates');
}
