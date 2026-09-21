export const version = '2026.08.24.1';

export async function up(connection) {
  await connection.query(`INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES
    ('summitEnabled', 'true'), ('summitChallengeMaxPoints', '50')`);
  await connection.query(`CREATE TABLE IF NOT EXISTS student_summit_progress (
    student_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    kilometers INT UNSIGNED NOT NULL DEFAULT 0,
    reached_summit_at DATETIME NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_summit_progress_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await connection.query(`CREATE TABLE IF NOT EXISTS student_summit_attempts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    student_id BIGINT UNSIGNED NOT NULL,
    stage_points SMALLINT UNSIGNED NOT NULL,
    challenge_json JSON NOT NULL,
    status ENUM('started','completed','failed') NOT NULL DEFAULT 'started',
    accuracy DECIMAL(6,4) NOT NULL DEFAULT 0,
    errors_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    reward_points SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME NULL,
    INDEX summit_attempt_student_stage (student_id, stage_points),
    CONSTRAINT fk_summit_attempt_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await connection.query(`CREATE TABLE IF NOT EXISTS student_summit_stage_rewards (
    student_id BIGINT UNSIGNED NOT NULL,
    stage_points SMALLINT UNSIGNED NOT NULL,
    best_reward SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    attempts_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    completed_at DATETIME NULL,
    PRIMARY KEY (student_id, stage_points),
    CONSTRAINT fk_summit_reward_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await connection.query(`CREATE TABLE IF NOT EXISTS student_summit_kilometer_transactions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    student_id BIGINT UNSIGNED NOT NULL,
    delta_kilometers INT NOT NULL,
    balance_after INT UNSIGNED NOT NULL,
    source_type VARCHAR(40) NOT NULL,
    source_id BIGINT UNSIGNED NULL,
    reason VARCHAR(255) NOT NULL,
    actor_role VARCHAR(40) NOT NULL,
    actor_id BIGINT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY summit_transaction_source (student_id, source_type, source_id),
    CONSTRAINT fk_summit_transaction_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}
