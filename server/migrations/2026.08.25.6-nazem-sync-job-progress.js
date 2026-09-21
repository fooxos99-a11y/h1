export const version = '2026.08.25.6';

async function columnExists(connection, column) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'nazem_sync_jobs' AND column_name = ?`,
    [column],
  );
  return Number(row.count) > 0;
}

export async function up(connection) {
  if (!await columnExists(connection, 'progress_percent')) {
    await connection.query(
      'ALTER TABLE nazem_sync_jobs ADD COLUMN progress_percent TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER max_attempts',
    );
  }
  if (!await columnExists(connection, 'progress_stage')) {
    await connection.query(
      'ALTER TABLE nazem_sync_jobs ADD COLUMN progress_stage VARCHAR(80) NULL AFTER progress_percent',
    );
  }
}

export async function down(connection) {
  if (await columnExists(connection, 'progress_stage')) {
    await connection.query('ALTER TABLE nazem_sync_jobs DROP COLUMN progress_stage');
  }
  if (await columnExists(connection, 'progress_percent')) {
    await connection.query('ALTER TABLE nazem_sync_jobs DROP COLUMN progress_percent');
  }
}
