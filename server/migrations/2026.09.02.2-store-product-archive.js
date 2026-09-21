export const version = '2026.09.02.2';

async function columnExists(connection, tableName, columnName) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [tableName, columnName],
  );
  return Number(row?.count || 0) > 0;
}

export async function up(connection) {
  if (!await columnExists(connection, 'store_products', 'deleted_at')) {
    await connection.query(
      'ALTER TABLE store_products ADD COLUMN deleted_at TIMESTAMP NULL AFTER is_active',
    );
  }
}

export async function down(connection) {
  if (await columnExists(connection, 'store_products', 'deleted_at')) {
    await connection.query('ALTER TABLE store_products DROP COLUMN deleted_at');
  }
}
