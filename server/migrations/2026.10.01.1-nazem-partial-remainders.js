export const version = '2026.10.01.1';

export async function up(connection) {
  const [[column]] = await connection.query(`SELECT COUNT(*) AS count FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'student_quran_tasks' AND column_name = 'nazem_remainder_key'`);
  if (!Number(column.count)) await connection.query(`ALTER TABLE student_quran_tasks
    ADD COLUMN nazem_remainder_key VARCHAR(80) NOT NULL DEFAULT ''`);
  const [[index]] = await connection.query(`SELECT COUNT(*) AS count FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'student_quran_tasks'
      AND index_name = 'student_quran_task_unique' AND column_name = 'nazem_remainder_key'`);
  if (!Number(index.count)) await connection.query(`ALTER TABLE student_quran_tasks
    DROP INDEX student_quran_task_unique,
    ADD UNIQUE KEY student_quran_task_unique
      (plan_id, task_date, task_type, track, from_page, to_page, nazem_remainder_key)`);
}

export async function down(connection) {
  const [duplicates] = await connection.query(`SELECT 1 FROM student_quran_tasks
    GROUP BY plan_id, task_date, task_type, track, from_page, to_page HAVING COUNT(*) > 1 LIMIT 1`);
  if (duplicates.length) throw new Error('Cannot roll back Nazem remainders without discarding recorded tasks. Restore the verified backup instead.');
  await connection.query(`ALTER TABLE student_quran_tasks
    DROP INDEX student_quran_task_unique,
    ADD UNIQUE KEY student_quran_task_unique (plan_id, task_date, task_type, track, from_page, to_page),
    DROP COLUMN nazem_remainder_key`);
}
