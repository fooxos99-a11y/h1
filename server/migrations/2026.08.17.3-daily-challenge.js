export const version = '2026.08.17.3';

export async function up(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS daily_challenge_attempts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      student_id BIGINT UNSIGNED NOT NULL,
      challenge_date DATE NOT NULL,
      game_type VARCHAR(40) NOT NULL,
      challenge_json LONGTEXT NOT NULL,
      status ENUM('started', 'completed', 'failed') NOT NULL DEFAULT 'started',
      points_awarded INT NOT NULL DEFAULT 0,
      started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP NULL DEFAULT NULL,
      UNIQUE KEY daily_challenge_student_date (student_id, challenge_date),
      INDEX daily_challenge_date_status (challenge_date, status),
      CONSTRAINT daily_challenge_student_fk FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await connection.query(`
    INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES
      ('dailyChallengeEnabled', 'false'),
      ('dailyChallengePoints', '20'),
      ('dailyChallengeGames', '["size_ordering","color_difference","math_problems","instant_memory"]'),
      ('dailyChallengeDays', '[0,1,2,3,4,5,6]')
  `);
}
