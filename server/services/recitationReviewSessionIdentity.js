// Preserve duplicate protection for reviews accepted before task-scoped slots.
// The caller holds the task lock; never move or replace a different review's slot.
export async function resolveReviewSessionIdentity(connection, task, sessionDate, sessionType) {
  if (!/^review:\d{4}-\d{2}-\d{2}:\d+$/.test(sessionType)) return sessionType;
  const legacyType = sessionType.slice(0, sessionType.lastIndexOf(':'));
  const [[legacy]] = await connection.query(
    `SELECT slot.session_id AS sessionId
     FROM student_quran_recitation_daily_slots slot
     WHERE slot.student_id = ? AND slot.session_date = ? AND slot.session_type = ?
       AND (EXISTS (SELECT 1 FROM student_quran_recitation_session_parts part
         WHERE part.session_id = slot.session_id AND part.task_id = ? AND part.status = 'accepted')
       OR EXISTS (SELECT 1 FROM student_quran_recitation_attempts attempt
         WHERE attempt.task_id = ? AND attempt.is_official = 1
           AND (attempt.session_id = slot.session_id OR attempt.request_id LIKE CONCAT(slot.session_id, ':%'))))
     FOR UPDATE`,
    [task.studentId, sessionDate, legacyType, task.id, task.id],
  );
  return legacy ? legacyType : sessionType;
}
