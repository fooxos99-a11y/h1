// Materialize the latest official session once for the teacher's assigned
// students. A correlated MAX per historical task made entry take seconds.
// Derive ownership from the task, as the original retry rule does.
export const latestRecitationRetryJoinSql = `LEFT JOIN (
  SELECT DISTINCT previous_attempt.task_id
  FROM (
    SELECT latest_task.student_id, MAX(latest_attempt.session_date) AS session_date
    FROM student_quran_recitation_attempts latest_attempt
    JOIN student_quran_tasks latest_task ON latest_task.id = latest_attempt.task_id
    JOIN students latest_student ON latest_student.id = latest_task.student_id
    JOIN supervisor_committees latest_scope ON latest_scope.committee_id = latest_student.committee_id
    WHERE latest_scope.supervisor_id = ? AND latest_attempt.is_official = 1
    GROUP BY latest_task.student_id
  ) latest_session
  JOIN student_quran_tasks previous_task ON previous_task.student_id = latest_session.student_id
  JOIN student_quran_recitation_attempts previous_attempt
    ON previous_attempt.task_id = previous_task.id
   AND previous_attempt.session_date = latest_session.session_date
   AND previous_attempt.is_official = 1
) retryable_session ON retryable_session.task_id = t.id`;
