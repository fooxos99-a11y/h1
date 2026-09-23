export const version = '2026.09.23.1';

export async function up(connection) {
  const [[row]] = await connection.query(`SELECT COUNT(*) AS count FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'nazem_student_links' AND column_name = 'roster_active'`);
  if (!Number(row.count)) await connection.query(`ALTER TABLE nazem_student_links
    ADD COLUMN roster_active TINYINT NULL DEFAULT NULL,
    ADD COLUMN roster_checked_at DATETIME(3) NULL DEFAULT NULL`);
}

export async function down(connection) {
  await connection.query('ALTER TABLE nazem_student_links DROP COLUMN roster_active, DROP COLUMN roster_checked_at');
}
