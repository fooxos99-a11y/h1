export const version = '2026.08.24.2';

export async function up(connection) {
  const [[legacyColumn]] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'student_summit_attempts'
       AND column_name = 'reward_kilometers'`,
  );
  const [[pointsColumn]] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'student_summit_attempts'
       AND column_name = 'reward_points'`,
  );
  if (Number(legacyColumn.count) > 0 && Number(pointsColumn.count) === 0) {
    await connection.query(
      'ALTER TABLE student_summit_attempts CHANGE COLUMN reward_kilometers reward_points SMALLINT UNSIGNED NOT NULL DEFAULT 0',
    );
  }
  await connection.query(
    "INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES ('summitChallengeMaxPoints', '50')",
  );
}
