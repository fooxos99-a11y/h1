export const version = '2026.09.04.1';

const indexName = 'nazem_sync_jobs_entity_latest_lookup';

async function indexExists(connection) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'nazem_sync_jobs'
       AND index_name = ?`,
    [indexName],
  );
  return Number(row?.count || 0) > 0;
}

export async function up(connection) {
  if (!await indexExists(connection)) {
    await connection.query(
      `ALTER TABLE nazem_sync_jobs
       ADD INDEX nazem_sync_jobs_entity_latest_lookup
         (teacher_id, operation_type, entity_type, entity_id, id)`,
    );
  }
}

export async function down(connection) {
  if (await indexExists(connection)) {
    await connection.query(
      'ALTER TABLE nazem_sync_jobs DROP INDEX nazem_sync_jobs_entity_latest_lookup',
    );
  }
}
