import { latestRecitationJobSql } from './recitationQueueRecovery.js';

const finalStatuses = new Set(['completed','not_completed','partial','completed_early','partial_early','completed_late']);
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const sameIds = (first, second) => JSON.stringify(first.map(Number).sort((a,b)=>a-b)) === JSON.stringify(second.map(Number).sort((a,b)=>a-b));

export function verifiedLinkSnapshot(job, day, tasks) {
  const payload = parse(job.payload) || {};
  const target = payload.submissionTarget;
  const source = target?.source;
  if (day.remoteType !== 'conserve' || !finalStatuses.has(day.status) || day.link == null
    || !Number.isFinite(Number(day.link)) || Number(day.link) < 0 || Number(day.link) > 40
    || payload.taskType !== 'link' || String(payload.taskDate) !== String(day.date).slice(0,10)
    || !source?.id || String(source.source_day_id || source.id) !== String(day.id)
    || !target.studentExternalId || String(target.studentExternalId) !== String(job.nazemStudentId)
    || !target.planExternalId || String(target.planExternalId) !== String(job.nazemPlanId)
    || ['surah_from','verse_from','surah_to','verse_to'].some(key=>Number(source[key]) !== Number(day[key]))
    || !tasks.length || tasks.some(task=>!Number(task.attemptId) || task.linkCount == null)
    || !sameIds(target.attemptIds || [], tasks.map(task=>task.attemptId))
    || Number(day.link) !== tasks.reduce((total, task)=>total+Number(task.linkCount),0)) return null;
  return { externalId: `link:${day.id}`, status: Number(day.link)>0 ? 'completed' : 'not_completed',
    metrics: { link: Number(day.link) }, alreadyRecorded: true };
}

// Caller holds the student transaction. This confirms an independently read remote receipt only.
export async function confirmVerifiedNazemLinks(connection, link, day) {
  if (day.remoteType !== 'conserve' || !finalStatuses.has(day.status) || day.link == null) return [];
  const [jobs] = await connection.query(`SELECT job.id, job.payload_json AS payload, job.attempt_count AS attemptCount,
    daily.id AS dailyId, daily.track, plan.nazem_plan_id AS nazemPlanId, student.nazem_student_id AS nazemStudentId
    FROM nazem_sync_jobs job JOIN nazem_daily_follow_up_links daily ON daily.id = job.entity_id AND daily.teacher_id = job.teacher_id
    JOIN nazem_plan_links plan ON plan.ruwasi_plan_id = daily.ruwasi_plan_id AND plan.teacher_id = job.teacher_id
    JOIN nazem_student_links student ON student.ruwasi_student_id = job.student_id AND student.teacher_id = job.teacher_id
    WHERE job.operation_type = 'recitation.submit' AND job.entity_type = 'recitation_day'
      AND job.teacher_id = ? AND job.student_id = ? AND daily.ruwasi_plan_id = ?
      AND daily.follow_up_date = ? AND daily.task_type = 'link'
      AND job.status IN ('pending','retrying','blocked','requires_review','conflict','failed')
      AND ${latestRecitationJobSql('job')} FOR UPDATE`,
  [link.teacherId,link.studentId,link.planId,String(day.date).slice(0,10)]);
  const confirmed = [];
  for (const job of jobs) {
    const [tasks] = await connection.query(`SELECT task.actual_link_count AS linkCount,
      (SELECT attempt.id FROM student_quran_recitation_attempts attempt WHERE attempt.task_id = task.id AND attempt.is_official = 1
        ORDER BY attempt.attempt_number DESC, attempt.id DESC LIMIT 1) AS attemptId
      FROM student_quran_tasks task WHERE task.plan_id = ? AND task.student_id = ? AND task.task_date = ?
        AND task.task_type = 'link' AND task.track = ? ORDER BY task.id`,
    [link.planId,link.studentId,String(day.date).slice(0,10),job.track]);
    const receipt = verifiedLinkSnapshot(job,day,tasks);
    if (!receipt) continue;
    // One remote day can cover several attempts; its unique external ID belongs to the daily receipt.
    await connection.query(`UPDATE nazem_recitation_links SET sync_status = 'synced',
      last_synced_at = NOW(3), last_error_code = NULL, last_error = NULL, remote_snapshot = ?
      WHERE teacher_id = ? AND daily_follow_up_id = ? AND ruwasi_recitation_id IN (?)`,
    [JSON.stringify(receipt),link.teacherId,job.dailyId,tasks.map(task=>Number(task.attemptId))]);
    await connection.query(`UPDATE nazem_daily_follow_up_links SET sync_status = 'synced', nazem_record_id = ?,
      last_synced_at = NOW(3), last_error_code = NULL, last_error = NULL WHERE id = ? AND teacher_id = ?`,
    [receipt.externalId,job.dailyId,link.teacherId]);
    await connection.query(`UPDATE nazem_sync_jobs SET status = 'synced', lease_owner = NULL, lease_expires_at = NULL,
      last_error_code = NULL, last_error = NULL, last_succeeded_at = NOW(3), progress_percent = 100, progress_stage = 'completed'
      WHERE id = ?`,[job.id]);
    await connection.query(`INSERT INTO nazem_sync_events
      (job_id,teacher_id,student_id,operation_type,status,attempt_number,metadata_json)
      VALUES (?,?,?,'recitation.submit','synced',?,?)`,
    [job.id,link.teacherId,link.studentId,job.attemptCount,JSON.stringify({ ...receipt, verifiedFromRemoteFollowUp: true })]);
    confirmed.push(Number(job.id));
  }
  return confirmed;
}
