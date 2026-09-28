import { blockedNazemError } from './errors.js';

// A recorded result (including an explicit failure) completes the local dependency.
// Waiting for remote link delivery here would deadlock: Nazem saves link with memorization.
export async function requireRecordedNazemLink(connection, task, mapped, job) {
  if (mapped.taskType !== 'memorization' || mapped.remoteType !== 'conserve' || mapped.nazemLateId) return;
  // A possibly sent request is verification-only under the durable write journal.
  if ((job.payload?.deliveryWrites || []).some(write => !write.rejectedAt)) return;
  const [links] = await connection.query(`SELECT t.id, t.actual_link_count AS linkCount,
    EXISTS (SELECT 1 FROM student_quran_recitation_attempts a
      WHERE a.task_id = t.id AND a.is_official = 1) AS evaluated
    FROM student_quran_tasks t WHERE t.plan_id = ? AND t.student_id = ?
      AND t.task_date = ? AND t.task_type = 'link' AND t.track = 'memorization'`,
  [task.planId, task.studentId, task.taskDate]);
  if (!links.length) return;
  if (links.some(link => !Number(link.evaluated) || link.linkCount == null)) {
    throw blockedNazemError('الحفظ محفوظ محليًا وبانتظار تسجيل نتيجة الربط قبل إرسالهما إلى ناظم.', 'NAZEM_MEMORIZATION_WAITING_FOR_LINK');
  }
  mapped.linkCount = links.reduce((sum, link) => sum + Number(link.linkCount), 0);
}

export async function wakeNazemMemorizationAfterLink(connection, task, teacherId) {
  return connection.query(`UPDATE nazem_sync_jobs job SET status = 'pending',
    max_attempts = GREATEST(max_attempts, attempt_count + 2), next_attempt_at = NOW(3),
    last_error_code = NULL, last_error = NULL
    WHERE teacher_id = ? AND student_id = ? AND operation_type = 'recitation.submit'
      AND status = 'blocked' AND last_error_code = 'NAZEM_MEMORIZATION_WAITING_FOR_LINK'
      AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.planId')) = ?
      AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.taskDate')) = ?
      AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.taskType')) = 'memorization'
      AND EXISTS (SELECT 1 FROM student_quran_tasks t WHERE t.plan_id = ?
        AND t.student_id = job.student_id AND t.task_date = ? AND t.task_type = 'link' AND t.track = 'memorization')
      AND NOT EXISTS (SELECT 1 FROM student_quran_tasks t WHERE t.plan_id = ?
        AND t.student_id = job.student_id AND t.task_date = ? AND t.task_type = 'link' AND t.track = 'memorization'
        AND (t.actual_link_count IS NULL OR NOT EXISTS (SELECT 1 FROM student_quran_recitation_attempts a
          WHERE a.task_id = t.id AND a.is_official = 1)))`,
  [teacherId, task.studentId, String(task.planId), task.taskDate, task.planId, task.taskDate, task.planId, task.taskDate]);
}
