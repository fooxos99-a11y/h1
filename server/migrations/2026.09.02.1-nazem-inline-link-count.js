export const version = '2026.09.02.1';

async function columnExists(connection, tableName, columnName) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [tableName, columnName],
  );
  return Number(row?.count || 0) > 0;
}

export async function up(connection) {
  if (!await columnExists(connection, 'student_quran_tasks', 'actual_link_count')) {
    await connection.query(
      'ALTER TABLE student_quran_tasks ADD COLUMN actual_link_count INT NULL AFTER actual_listening_count',
    );
  }
}

export async function down(connection) {
  if (await columnExists(connection, 'student_quran_tasks', 'actual_link_count')) {
    await connection.query('ALTER TABLE student_quran_tasks DROP COLUMN actual_link_count');
  }
}
