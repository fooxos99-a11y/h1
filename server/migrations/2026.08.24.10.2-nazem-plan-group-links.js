export const version = '2026.08.24.10.2';

export async function up(connection) {
  const [studentGroupIndexes] = await connection.query(
    `SELECT INDEX_NAME AS indexName
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'nazem_plan_links'
       AND INDEX_NAME = 'nazem_plan_links_student_group_unique'`,
  );
  if (!studentGroupIndexes.length) {
    await connection.query(
      `ALTER TABLE nazem_plan_links
       ADD UNIQUE KEY nazem_plan_links_student_group_unique
         (teacher_id, ruwasi_student_id, nazem_plan_id)`,
    );
  }
  const [externalIndexes] = await connection.query(
    `SELECT INDEX_NAME AS indexName
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'nazem_plan_links'
       AND INDEX_NAME = 'nazem_plan_links_external_unique'`,
  );
  if (externalIndexes.length) {
    await connection.query('ALTER TABLE nazem_plan_links DROP INDEX nazem_plan_links_external_unique');
  }
}

export async function down(connection) {
  const [[duplicate]] = await connection.query(
    `SELECT teacher_id, nazem_plan_id, COUNT(*) AS linkCount
     FROM nazem_plan_links
     WHERE nazem_plan_id IS NOT NULL
     GROUP BY teacher_id, nazem_plan_id
     HAVING COUNT(*) > 1
     LIMIT 1`,
  );
  if (duplicate) {
    throw new Error(
      'Cannot roll back Nazem group links while one external plan group is linked to multiple students.',
    );
  }
  await connection.query('ALTER TABLE nazem_plan_links DROP INDEX nazem_plan_links_student_group_unique');
  await connection.query(
    `ALTER TABLE nazem_plan_links
     ADD UNIQUE KEY nazem_plan_links_external_unique (teacher_id, nazem_plan_id)`,
  );
}
