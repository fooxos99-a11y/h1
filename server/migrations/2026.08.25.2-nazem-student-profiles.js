export const version = '2026.08.25.2';

async function columnExists(connection, table, column) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column],
  );
  return Number(row.count) > 0;
}

export async function up(connection) {
  if (!await columnExists(connection, 'nazem_student_candidates', 'remote_snapshot')) {
    await connection.query(
      'ALTER TABLE nazem_student_candidates ADD COLUMN remote_snapshot JSON NULL AFTER external_circle_name',
    );
  }
}

export async function down(connection) {
  if (await columnExists(connection, 'nazem_student_candidates', 'remote_snapshot')) {
    await connection.query('ALTER TABLE nazem_student_candidates DROP COLUMN remote_snapshot');
  }
}
