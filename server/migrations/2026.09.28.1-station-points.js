export const version = '2026.09.28.1';

export async function up(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS student_station_points (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    student_id BIGINT UNSIGNED NOT NULL,
    station_id VARCHAR(96) NOT NULL,
    earned_points INT UNSIGNED NOT NULL DEFAULT 0,
    completed_at DATETIME NOT NULL,
    UNIQUE KEY station_student_unique (station_id, student_id),
    CONSTRAINT station_points_student_fk FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

export async function down(connection) {
  const [[row]] = await connection.query('SELECT COUNT(*) AS count FROM student_station_points');
  if (Number(row.count)) throw new Error('Cannot remove recorded station points.');
  await connection.query('DROP TABLE student_station_points');
}
