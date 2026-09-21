export const version = '2026.08.24.10.1';

async function addColumnIfMissing(connection, table, column, definition) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column],
  );
  if (!Number(row.count)) await connection.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export async function up(connection) {
  await addColumnIfMissing(connection, 'nazem_accounts', 'identity_confirmed_at', 'DATETIME(3) NULL AFTER external_organization_name');
  await addColumnIfMissing(connection, 'nazem_accounts', 'identity_confirmed_by', 'BIGINT UNSIGNED NULL AFTER identity_confirmed_at');
}

export async function down(connection) {
  await connection.query('ALTER TABLE nazem_accounts DROP COLUMN identity_confirmed_by');
  await connection.query('ALTER TABLE nazem_accounts DROP COLUMN identity_confirmed_at');
}
