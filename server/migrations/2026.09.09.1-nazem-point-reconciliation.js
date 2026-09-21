import { getBusinessDate } from '../../shared/business-date.js';

export const version = '2026.09.09.1';
export const createTableSql = `CREATE TABLE IF NOT EXISTS nazem_point_reconciliations (
  daily_follow_up_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  source_hash CHAR(64) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  expected_points INT NULL,
  recorded_points INT NULL,
  last_error VARCHAR(500) NULL,
  checked_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX nazem_point_reconciliation_pending (status, updated_at),
  CONSTRAINT nazem_point_reconciliation_daily_fk FOREIGN KEY (daily_follow_up_id)
    REFERENCES nazem_daily_follow_up_links(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

export async function up(connection) {
  await connection.query(createTableSql);
  await connection.query(`INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES (?, ?)`,
    ['nazemPointsStartDate', getBusinessDate()]);
}

export async function down(connection) {
  await connection.query('DROP TABLE IF EXISTS nazem_point_reconciliations');
  // Retain the activation date so a rollback/reapply cannot change historical eligibility.
}
