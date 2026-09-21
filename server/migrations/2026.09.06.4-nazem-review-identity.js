export const version = '2026.09.06.4';

export async function up(connection) {
  const [[column]] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'student_quran_tasks'
       AND column_name = 'nazem_review_id'`,
  );
  if (!Number(column.count)) {
    await connection.query(`ALTER TABLE student_quran_tasks
      ADD COLUMN nazem_review_id BIGINT UNSIGNED NULL,
      ADD UNIQUE KEY student_quran_nazem_review_unique (nazem_review_id),
      ADD CONSTRAINT student_quran_nazem_review_fk FOREIGN KEY (nazem_review_id)
        REFERENCES nazem_daily_follow_up_links(id) ON DELETE SET NULL ON UPDATE CASCADE`);
  }
}

export async function down(connection) {
  const [[column]] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'student_quran_tasks'
       AND column_name = 'nazem_review_id'`,
  );
  if (Number(column.count)) await connection.query(`ALTER TABLE student_quran_tasks
    DROP FOREIGN KEY student_quran_nazem_review_fk,
    DROP INDEX student_quran_nazem_review_unique, DROP COLUMN nazem_review_id`);
}
