// Keep accepted legacy slots authoritative only for the lesson they recorded.
// An old compensation must not occupy today's local lesson after an upgrade.
export async function resolveLocalSessionIdentity(connection, task, sessionDate, sessionType) {
  if (!/^(memorization|mastery|review|link):\d{4}-\d{2}-\d{2}(?::(?:p[1-9]\d{0,14}|[1-9]\d{0,14}))?$/.test(sessionType)) return sessionType;
  const baseType = sessionType.split(':')[0];
  const datedType = `${baseType}:${task.taskDate}`;
  const exactReview = Boolean(Number(task.nazemManaged) && task.taskType === 'review');
  const exactTaskSql = exactReview ? 'AND recorded.id = ?' : '';
  const [[legacy]] = await connection.query(
    `SELECT slot.session_type AS sessionType
     FROM student_quran_recitation_daily_slots slot
     WHERE slot.student_id = ? AND slot.session_date = ?
       AND (slot.session_type IN (?, ?) OR slot.session_type LIKE ?)
       AND (EXISTS (SELECT 1 FROM student_quran_recitation_session_parts part
         JOIN student_quran_tasks recorded ON recorded.id = part.task_id
         WHERE part.session_id = slot.session_id AND part.status = 'accepted'
           AND recorded.task_date = ? AND recorded.task_type = ? AND recorded.track = ?
           AND recorded.plan_id = ? ${exactTaskSql})
       OR EXISTS (SELECT 1 FROM student_quran_recitation_attempts attempt
         JOIN student_quran_tasks recorded ON recorded.id = attempt.task_id
         WHERE attempt.is_official = 1
           AND (attempt.session_id = slot.session_id OR attempt.request_id LIKE CONCAT(slot.session_id, ':%'))
           AND recorded.task_date = ? AND recorded.task_type = ? AND recorded.track = ?
           AND recorded.plan_id = ? ${exactTaskSql}))
     ORDER BY slot.session_type LIMIT 1 FOR UPDATE`,
    [task.studentId, sessionDate, baseType, datedType, `${datedType}:%`,
      task.taskDate, task.taskType, task.track || 'memorization', task.planId, ...(exactReview ? [task.id] : []),
      task.taskDate, task.taskType, task.track || 'memorization', task.planId, ...(exactReview ? [task.id] : [])],
  );
  return legacy?.sessionType || sessionType;
}
