export const version = '2026.08.24.3';

async function renameLegacyStageColumn(connection, tableName) {
  const [[legacy]] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = 'stage_kilometers'`,
    [tableName],
  );
  const [[current]] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = 'stage_points'`,
    [tableName],
  );
  if (Number(legacy.count) > 0 && Number(current.count) === 0) {
    await connection.query(
      `ALTER TABLE \`${tableName}\` CHANGE COLUMN stage_kilometers stage_points SMALLINT UNSIGNED NOT NULL`,
    );
  }
}

export async function up(connection) {
  await renameLegacyStageColumn(connection, 'student_summit_attempts');
  await renameLegacyStageColumn(connection, 'student_summit_stage_rewards');
}
