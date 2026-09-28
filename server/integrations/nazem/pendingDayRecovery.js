import { matchesNazemTarget } from './recitationTarget.js';

const json = value => typeof value === 'string' ? JSON.parse(value) : value;

export function readyPendingDayRecoveryKey(row) {
  const payload = json(row.payload);
  const remote = json(row.remote);
  const source = payload?.submissionTarget?.source;
  if (Number(row.teacherCompleted) !== 1 || Number(row.attemptCompleted) !== 1
    || payload?.taskType !== 'memorization' || !source?.id || source.nazemLate
    || !remote?.nazemPendingDay || remote.status !== 'pending'
    || remote.nazemActionableDate !== payload.taskDate) return null;
  const mapped = { date: payload.taskDate, taskType: payload.taskType, nazemSourceDayId: source.id,
    fromSurahId: source.surah_from, fromAyah: source.verse_from,
    scheduledToSurahId: source.surah_to, scheduledToAyah: source.verse_to };
  if (!matchesNazemTarget(remote, mapped, payload.taskDate)) return null;
  const key = `${remote.id}:${payload.taskDate}:${remote.surah_from}:${remote.verse_from}:${remote.surah_to}:${remote.verse_to}`;
  return payload.pendingDayRecoveryKey === key ? null : key;
}

// Refreshing Nazem can expose an older completed evaluation as the next pending
// day. Wake it once for that verified target, even if no local save occurs.
export async function wakeReadyPendingNazemDay(connection, { teacherId, studentId, planId }) {
  const [[active]] = await connection.query(`SELECT id FROM nazem_sync_jobs
    WHERE teacher_id = ? AND student_id = ? AND operation_type = 'recitation.submit'
    AND status IN ('pending','retrying','syncing') LIMIT 1`, [teacherId, studentId]);
  if (active) return null;
  const [rows] = await connection.query(`SELECT job.id, job.payload_json AS payload, daily.remote_snapshot AS remote,
    task.teacher_completed AS teacherCompleted, attempt.teacher_completed AS attemptCompleted
    FROM nazem_sync_jobs job
    JOIN nazem_daily_follow_up_links daily ON daily.id = job.entity_id AND job.entity_type = 'recitation_day'
    JOIN student_quran_tasks task ON task.id = JSON_EXTRACT(job.payload_json, '$.taskId')
      AND task.student_id = job.student_id AND task.plan_id = daily.ruwasi_plan_id
    JOIN student_quran_recitation_attempts attempt ON attempt.id = JSON_EXTRACT(job.payload_json, '$.attemptId')
      AND attempt.task_id = task.id AND attempt.is_official = 1
    WHERE job.teacher_id = ? AND job.student_id = ? AND daily.ruwasi_plan_id = ?
      AND job.operation_type = 'recitation.submit' AND job.status = 'blocked'
      AND job.last_error_code = 'NAZEM_PREVIOUS_DAYS_BLOCKING'
      AND NOT EXISTS (SELECT 1 FROM student_quran_recitation_attempts newer WHERE newer.task_id = task.id
        AND newer.is_official = 1 AND (newer.attempt_number > attempt.attempt_number
          OR (newer.attempt_number = attempt.attempt_number AND newer.id > attempt.id)))
    ORDER BY daily.follow_up_date, job.id`, [teacherId, studentId, planId]);
  for (const row of rows) {
    const key = readyPendingDayRecoveryKey(row);
    if (!key) continue;
    const [result] = await connection.query(`UPDATE nazem_sync_jobs SET status = 'pending', next_attempt_at = NOW(3),
      max_attempts = GREATEST(max_attempts, attempt_count + 2), lease_owner = NULL, lease_expires_at = NULL,
      last_heartbeat_at = NULL, progress_stage = 'pending-day-ready',
      payload_json = JSON_SET(payload_json, '$.pendingDayRecoveryKey', ?)
      WHERE id = ? AND status = 'blocked' AND last_error_code = 'NAZEM_PREVIOUS_DAYS_BLOCKING'
      AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.pendingDayRecoveryKey')), '') <> ?`, [key, row.id, key]);
    return result.affectedRows ? Number(row.id) : null;
  }
  return null;
}
