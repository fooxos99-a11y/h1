import crypto from 'node:crypto';
import { isNazemFollowUpCompleted } from '../../../shared/nazem-integration.js';
import { readNazemLinkCount } from '../../../shared/nazem-recitation-policy.js';
import { getRecitationEvaluationPolicy } from '../../../shared/evaluation-settings.js';
import { loadRecitationRewardSettings } from '../../services/recitationRewards.js';

// A link result has a count, not independent error marks. Only a complete, known count is accepted.
export async function importNazemLinkResult(connection, link, day, dailyId) {
  if (day.taskType !== 'memorization' || day.remoteType !== 'conserve') return;
  const count = isNazemFollowUpCompleted(day.status) ? readNazemLinkCount(day.link) : 0;
  if (count == null) return;
  const [[plan]] = await connection.query(`SELECT JSON_UNQUOTE(JSON_EXTRACT(remote_snapshot, '$.primary.linkCount')) AS expectedCount
    FROM nazem_plan_links WHERE teacher_id = ? AND ruwasi_plan_id = ? AND ruwasi_student_id = ?
      AND sync_status NOT IN ('deleted','detached') LIMIT 1`, [link.teacherId, link.planId, link.studentId]);
  const expected = readNazemLinkCount(plan?.expectedCount);
  if (expected == null || (count !== 0 && count !== expected)) return;
  const [tasks] = await connection.query(`SELECT t.id, t.evaluated_at AS evaluatedAt,
    t.teacher_completed AS teacherCompleted, t.actual_link_count AS actualLinkCount,
    EXISTS (SELECT 1 FROM student_quran_recitation_attempts a
      JOIN nazem_recitation_links delivery ON delivery.ruwasi_recitation_id = a.id
      WHERE a.task_id = t.id AND a.is_official = 1 AND delivery.teacher_id = ?
        AND delivery.sync_status IN ('pending','syncing','retrying','failed','blocked','requires_review','conflict')) AS hasPendingSubmission
    FROM student_quran_tasks t WHERE t.plan_id = ? AND t.student_id = ?
    AND t.task_date = ? AND t.task_type = 'link' AND t.track = 'memorization' ORDER BY t.id FOR UPDATE`,
  [link.teacherId, link.planId, link.studentId, day.date]);
  if (!tasks.length) return;
  // Memorization may arrive before the independent link update. Its old count
  // must not replace the official local attempt the delivery worker still needs.
  if (tasks.some((task) => Number(task.hasPendingSubmission))) return;
  const completed = expected > 0 && count === expected;
  if (tasks.every((task) => task.evaluatedAt && Number(task.teacherCompleted) === Number(completed))
    && tasks.reduce((sum, task) => sum + Number(task.actualLinkCount || 0), 0) === count) return;
  await saveNazemLinkTasks(connection, completed, tasks, count, link, day, dailyId);
  await connection.query(`UPDATE student_quran_tasks SET actual_link_count = NULL
    WHERE plan_id = ? AND student_id = ? AND task_date = ? AND task_type = 'memorization'`, [link.planId, link.studentId, day.date]);
}

async function saveNazemLinkTasks(connection, completed, tasks, count, link, day, dailyId) {
  const policy = getRecitationEvaluationPolicy(await loadRecitationRewardSettings(connection), { taskType: 'link' });
  const score = completed ? Math.round(policy.maxScore) : 0;
  for (const [index, task] of tasks.entries()) {
    await connection.query(`UPDATE student_quran_tasks SET teacher_rating_key = 'score', teacher_rating_label = ?,
      warning_count = 0, mistake_count = 0, evaluation_score = ?, evaluation_max_score = ?,
      evaluation_warning_deduction = ?, evaluation_mistake_deduction = ?, evaluation_passing_score = ?,
      teacher_completed = ?, student_status = ?, actual_link_count = ?, evaluated_by = ?, evaluated_at = NOW(3)
      WHERE id = ?`, [completed ? 'متقن' : 'لم يتم الربط', score, policy.maxScore, policy.warningDeduction,
    policy.mistakeDeduction, policy.passingScore, completed ? 1 : 0, completed ? 'done' : 'not_done', index === 0 ? count : 0, link.teacherId, task.id]);
    const requestId = `nazem-link:${day.id}:${task.id}`;
    await connection.query(`UPDATE student_quran_recitation_attempts SET is_official = 0
      WHERE task_id = ? AND is_official = 1 AND COALESCE(request_id, '') <> ?`, [task.id, requestId]);
    const [[sequence]] = await connection.query('SELECT COALESCE(MAX(attempt_number), 0) + 1 AS number FROM student_quran_recitation_attempts WHERE task_id = ?', [task.id]);
    const [attempt] = await connection.query(`INSERT INTO student_quran_recitation_attempts
      (task_id, student_id, evaluator_id, session_date, attempt_number, request_id, is_official,
       warning_count, mistake_count, evaluation_score, evaluation_max_score, evaluation_warning_deduction,
       evaluation_mistake_deduction, evaluation_passing_score, teacher_completed, ayah_marks_json, word_marks_json)
      VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0, ?, ?, ?, ?, ?, ?, '[]', '[]')
      ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), is_official = 1, evaluation_score = VALUES(evaluation_score),
        evaluation_max_score = VALUES(evaluation_max_score), evaluation_passing_score = VALUES(evaluation_passing_score),
        teacher_completed = VALUES(teacher_completed), evaluated_at = NOW(3)`, [task.id, link.studentId, link.teacherId,
    day.date, sequence.number, requestId, score, policy.maxScore, policy.warningDeduction, policy.mistakeDeduction, policy.passingScore, completed ? 1 : 0]);
    const fingerprint = crypto.createHash('sha256').update(`${link.teacherId}:${requestId}`).digest('hex');
    await connection.query(`INSERT INTO nazem_recitation_links (ruwasi_recitation_id, ruwasi_task_id, ruwasi_plan_id,
      teacher_id, daily_follow_up_id, external_fingerprint, sync_status, last_synced_at, remote_snapshot)
      VALUES (?, ?, ?, ?, ?, ?, 'synced', NOW(3), ?) ON DUPLICATE KEY UPDATE sync_status = 'synced',
        last_synced_at = NOW(3), remote_snapshot = VALUES(remote_snapshot), last_error = NULL, last_error_code = NULL`,
      [attempt.insertId, task.id, link.planId, link.teacherId, dailyId, fingerprint, JSON.stringify(day)]);
  }
}
