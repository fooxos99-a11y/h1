export const version = '2026.08.25.3';

async function columnExists(connection, table, column) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column],
  );
  return Number(row.count) > 0;
}

async function constraintExists(connection, table, constraint) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.table_constraints
     WHERE constraint_schema = DATABASE() AND table_name = ? AND constraint_name = ?`,
    [table, constraint],
  );
  return Number(row.count) > 0;
}

export async function up(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS nazem_daily_follow_up_links (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ruwasi_plan_id BIGINT UNSIGNED NOT NULL,
    ruwasi_student_id BIGINT UNSIGNED NOT NULL,
    teacher_id BIGINT UNSIGNED NOT NULL,
    follow_up_date DATE NOT NULL,
    task_type VARCHAR(40) NOT NULL,
    nazem_record_id VARCHAR(190) NULL,
    sync_status VARCHAR(40) NOT NULL DEFAULT 'pending',
    last_synced_at DATETIME(3) NULL,
    last_remote_checked_at DATETIME(3) NULL,
    last_error_code VARCHAR(80) NULL,
    last_error VARCHAR(500) NULL,
    local_snapshot JSON NULL,
    remote_snapshot JSON NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY nazem_daily_follow_up_unique
      (teacher_id, ruwasi_plan_id, ruwasi_student_id, follow_up_date, task_type),
    UNIQUE KEY nazem_daily_follow_up_remote_unique (teacher_id, nazem_record_id),
    INDEX nazem_daily_follow_up_status_lookup (sync_status, follow_up_date),
    CONSTRAINT nazem_daily_follow_up_plan_fk FOREIGN KEY (ruwasi_plan_id)
      REFERENCES student_quran_plans(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT nazem_daily_follow_up_student_fk FOREIGN KEY (ruwasi_student_id)
      REFERENCES students(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT nazem_daily_follow_up_teacher_fk FOREIGN KEY (teacher_id)
      REFERENCES supervisors(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT nazem_daily_follow_up_type_check
      CHECK (task_type IN ('memorization','review')),
    CONSTRAINT nazem_daily_follow_up_status_check
      CHECK (sync_status IN ('pending','syncing','synced','retrying','blocked','requires_review','conflict','failed'))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  if (!await columnExists(connection, 'nazem_recitation_links', 'daily_follow_up_id')) {
    await connection.query(
      `ALTER TABLE nazem_recitation_links
       ADD COLUMN daily_follow_up_id BIGINT UNSIGNED NULL AFTER teacher_id,
       ADD INDEX nazem_recitation_links_daily_lookup (daily_follow_up_id, sync_status),
       ADD CONSTRAINT nazem_recitation_links_daily_fk FOREIGN KEY (daily_follow_up_id)
         REFERENCES nazem_daily_follow_up_links(id) ON UPDATE CASCADE ON DELETE CASCADE`,
    );
  }
}

export async function down(connection) {
  if (await constraintExists(connection, 'nazem_recitation_links', 'nazem_recitation_links_daily_fk')) {
    await connection.query('ALTER TABLE nazem_recitation_links DROP FOREIGN KEY nazem_recitation_links_daily_fk');
  }
  if (await columnExists(connection, 'nazem_recitation_links', 'daily_follow_up_id')) {
    await connection.query(
      `ALTER TABLE nazem_recitation_links
       DROP INDEX nazem_recitation_links_daily_lookup,
       DROP COLUMN daily_follow_up_id`,
    );
  }
  await connection.query('DROP TABLE IF EXISTS nazem_daily_follow_up_links');
}
