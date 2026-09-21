export const version = '2026.09.06.1';

export async function up(connection) {
  const [[column]] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'nazem_daily_follow_up_links' AND column_name = 'track'`,
  );
  if (!Number(column.count)) {
    await connection.query(`ALTER TABLE nazem_daily_follow_up_links
      ADD COLUMN track ENUM('memorization','mastery') NOT NULL DEFAULT 'memorization' AFTER task_type`);
    await connection.query(`UPDATE nazem_daily_follow_up_links daily
      JOIN student_quran_plans plan ON plan.id = daily.ruwasi_plan_id
      SET daily.track = CASE WHEN daily.task_type = 'memorization' AND (
        JSON_UNQUOTE(JSON_EXTRACT(daily.remote_snapshot, '$.remoteType')) = 'master'
        OR (JSON_EXTRACT(daily.remote_snapshot, '$.remoteType') IS NULL AND plan.track = 'mastery')
      ) THEN 'mastery' ELSE 'memorization' END`);
  }
  await connection.query(`ALTER TABLE nazem_daily_follow_up_links
    DROP INDEX nazem_daily_follow_up_unique,
    ADD UNIQUE KEY nazem_daily_follow_up_unique
      (teacher_id, ruwasi_plan_id, ruwasi_student_id, follow_up_date, task_type, track)`);
  await connection.query(`ALTER TABLE student_quran_tasks
    DROP INDEX student_quran_task_unique,
    ADD UNIQUE KEY student_quran_task_unique (plan_id, task_date, task_type, track, from_page, to_page)`);
}

export async function down(connection) {
  // Refuse to discard either track when a day already contains both.
  for (const query of [
    `SELECT 1 FROM nazem_daily_follow_up_links
     GROUP BY teacher_id, ruwasi_plan_id, ruwasi_student_id, follow_up_date, task_type HAVING COUNT(*) > 1 LIMIT 1`,
    `SELECT 1 FROM student_quran_tasks
     GROUP BY plan_id, task_date, task_type, from_page, to_page HAVING COUNT(*) > 1 LIMIT 1`,
  ]) {
    const [duplicates] = await connection.query(query);
    if (duplicates.length) throw new Error('Cannot roll back independent tracks without discarding recitation data. Restore the verified backup instead.');
  }
  await connection.query(`ALTER TABLE student_quran_tasks
    DROP INDEX student_quran_task_unique,
    ADD UNIQUE KEY student_quran_task_unique (plan_id, task_date, task_type, from_page, to_page)`);
  await connection.query(`ALTER TABLE nazem_daily_follow_up_links
    DROP INDEX nazem_daily_follow_up_unique,
    ADD UNIQUE KEY nazem_daily_follow_up_unique
      (teacher_id, ruwasi_plan_id, ruwasi_student_id, follow_up_date, task_type),
    DROP COLUMN track`);
}
