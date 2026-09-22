import crypto from 'node:crypto';
import { captureRecitationTarget } from './recitationSubmission.js';
import { nazemTaskTrack } from './taskTrack.js';
import os from 'node:os';
import { nazemFollowUpSlot } from '../../services/nazemFollowUpSchedule.js';
import { db } from '../../db.js';
import { nazemErrorDiagnostics } from './errorDiagnostics.js';
import { getBusinessDate, shiftDateOnly } from '../../../shared/business-date.js';
import { isNazemFollowUpCompleted } from '../../../shared/nazem-integration.js';

const WORKER_ID = `${os.hostname()}:${process.pid}:${crypto.randomUUID().slice(0, 8)}`;
const CLAIMABLE_STATUSES = ['pending', 'retrying'];
export const NAZEM_STRUCTURAL_ERROR_CODES = new Set([
  'NAZEM_SELECTOR_MISSING',
  'NAZEM_FORM_CHANGED',
  'NAZEM_PLAN_EDIT_FIELDS_CHANGED',
  'NAZEM_PLAN_EDIT_CONTRACT_CHANGED',
  'NAZEM_PLAN_DELETE_FORM_CHANGED',
  'NAZEM_PLAN_PREVIEW_MISSING',
  'NAZEM_TEACHER_CONTEXT_MISSING',
]);

export async function isNazemIntegrationEnabled(connection = db()) {
  const [[setting]] = await connection.query(
    "SELECT setting_value AS value FROM app_settings WHERE setting_key = 'nazemIntegrationEnabled' LIMIT 1",
  );
  return setting?.value === 'true';
}

export async function enqueueNazemSyncJob(connection, {
  operationType,
  entityType,
  entityId = null,
  teacherId,
  studentId = null,
  payload = {},
  idempotencyKey,
  maxAttempts = 4,
  nextAttemptAt = null,
}) {
  if (!teacherId || !operationType || !entityType || !idempotencyKey) return null;
  const syncUuid = crypto.randomUUID();
  const [result] = await connection.query(
    `INSERT INTO nazem_sync_jobs
      (sync_uuid, idempotency_key, operation_type, entity_type, entity_id, teacher_id, student_id,
       payload_json, max_attempts, next_attempt_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW(3)))
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id),
       payload_json = IF(operation_type <> 'recitation.submit' AND status IN ('pending','retrying','failed','blocked','requires_review','conflict','dismissed'), VALUES(payload_json), payload_json),
       next_attempt_at = IF(status IN ('failed','blocked','requires_review','conflict','dismissed'), VALUES(next_attempt_at), LEAST(next_attempt_at, VALUES(next_attempt_at))),
       max_attempts = IF(operation_type = 'recitation.submit' AND status IN ('failed','blocked','requires_review','conflict','dismissed'), GREATEST(max_attempts, attempt_count + VALUES(max_attempts)), max_attempts),
       attempt_count = IF(operation_type <> 'recitation.submit' AND status IN ('failed','blocked','requires_review','conflict','dismissed'), 0, attempt_count),
       status = IF(status IN ('failed','blocked','requires_review','conflict','dismissed'), 'pending', status),
       updated_at = NOW(3)`,
    [
      syncUuid,
      String(idempotencyKey).slice(0, 190),
      operationType,
      entityType,
      entityId,
      teacherId,
      studentId,
      JSON.stringify(payload || {}),
      Math.max(1, Math.min(10, Number(maxAttempts || 4))),
      nextAttemptAt,
    ],
  );
  return Number(result.insertId || 0) || null;
}

export async function enqueueNazemFollowUpRefresh(connection, teacherId, now = Date.now()) {
  const slot = nazemFollowUpSlot(now);
  if (!slot) return null;
  const idempotencyKey = `nazem:followups:${teacherId}:${slot.date}:${slot.hour}`;
  if (!await isNazemIntegrationEnabled(connection)) return null;
  const [[account]] = await connection.query(
    `SELECT teacher_id FROM nazem_accounts account WHERE teacher_id = ? AND status = 'connected'
      AND EXISTS (SELECT 1 FROM nazem_plan_links link WHERE link.teacher_id = account.teacher_id
        AND link.sync_status NOT IN ('deleted','detached'))`, [teacherId],
  );
  if (!account) return null;
  const [[recent]] = await connection.query(
    `SELECT id FROM nazem_sync_jobs WHERE teacher_id = ? AND operation_type = 'account.refresh_followups'
      AND (idempotency_key = ? OR status IN ('pending','retrying','syncing'))
      ORDER BY id DESC LIMIT 1`, [teacherId, idempotencyKey],
  );
  if (recent) return Number(recent.id);
  return enqueueNazemSyncJob(connection, {
    teacherId, operationType: 'account.refresh_followups', entityType: 'account', entityId: teacherId,
    payload: { requestedFrom: 'scheduled-followups', scheduledDate: slot.date, scheduledHour: slot.hour },
    idempotencyKey,
  });
}

export async function resolveNazemTeacherForStudent(
  connection,
  studentId,
  preferredTeacherId = null,
  planId = null,
) {
  if (planId) {
    const [[existingPlanLink]] = await connection.query(
      `SELECT link.teacher_id AS teacherId
       FROM nazem_plan_links link
       JOIN nazem_accounts account ON account.teacher_id = link.teacher_id AND account.status = 'connected'
       JOIN nazem_student_links studentLink ON studentLink.teacher_id = link.teacher_id
         AND studentLink.ruwasi_student_id = link.ruwasi_student_id AND studentLink.status = 'linked'
       WHERE link.ruwasi_plan_id = ? AND link.ruwasi_student_id = ? LIMIT 1`,
      [planId, studentId],
    );
    if (existingPlanLink) return Number(existingPlanLink.teacherId);
  }
  if (preferredTeacherId) {
    const [[preferred]] = await connection.query(
      `SELECT account.teacher_id AS teacherId
       FROM nazem_accounts account
       JOIN nazem_student_links link ON link.teacher_id = account.teacher_id
         AND link.ruwasi_student_id = ? AND link.status = 'linked'
       WHERE account.teacher_id = ? AND account.status = 'connected'
       LIMIT 1`,
      [studentId, preferredTeacherId],
    );
    if (preferred) return Number(preferred.teacherId);
  }
  const [linkedAccounts] = await connection.query(
    `SELECT account.teacher_id AS teacherId
     FROM nazem_accounts account
     JOIN nazem_student_links link ON link.teacher_id = account.teacher_id
       AND link.ruwasi_student_id = ? AND link.status = 'linked'
     WHERE account.status = 'connected'
     ORDER BY account.id
     LIMIT 2`,
    [studentId],
  );
  return linkedAccounts.length === 1 ? Number(linkedAccounts[0].teacherId) : null;
}

async function loadPlanSchedule(connection, planId) {
  const [[plan]] = await connection.query(
    `SELECT student_id AS studentId,
      plan_version AS planVersion,
      CASE WHEN start_date > CURDATE() THEN TIMESTAMP(start_date, '00:05:00') ELSE NULL END AS nextAttemptAt
     FROM student_quran_plans WHERE id = ? AND status = 'active' LIMIT 1`,
    [planId],
  );
  return plan || null;
}

async function enqueueNazemPlanForTeacher(connection, {
  planId,
  studentId,
  teacherId,
}) {
  const plan = await loadPlanSchedule(connection, planId);
  if (!plan || Number(plan.studentId) !== Number(studentId)) return null;
  const [[eligible]] = await connection.query(
    `SELECT account.id
     FROM nazem_accounts account
     JOIN nazem_student_links link ON link.teacher_id = account.teacher_id
       AND link.ruwasi_student_id = ? AND link.status = 'linked'
     WHERE account.teacher_id = ? AND account.status = 'connected' LIMIT 1`,
    [studentId, teacherId],
  );
  if (!eligible) return null;
  await connection.query(
    `INSERT INTO nazem_plan_links
      (ruwasi_plan_id, ruwasi_student_id, teacher_id, sync_status)
     VALUES (?, ?, ?, 'pending')
     ON DUPLICATE KEY UPDATE teacher_id = VALUES(teacher_id),
       sync_status = IF(sync_status = 'synced', sync_status, 'pending'),
       last_error_code = NULL, last_error = NULL`,
    [planId, studentId, teacherId],
  );
  return enqueueNazemSyncJob(connection, {
    operationType: 'plan.upsert',
    entityType: 'plan',
    entityId: planId,
    teacherId,
    studentId,
    payload: { planId, studentId },
    idempotencyKey: `nazem:plan:${planId}:upsert:${Number(plan.planVersion || 0)}`,
    nextAttemptAt: plan.nextAttemptAt,
  });
}

export async function prepareNazemPlanReplacement(connection, {
  oldPlanId,
  newPlanId,
  studentId,
  actor,
}) {
  if (!oldPlanId || !newPlanId || Number(oldPlanId) === Number(newPlanId)) return null;
  const [[planLink]] = await connection.query(
    `SELECT id, teacher_id AS teacherId, sync_status AS syncStatus
     FROM nazem_plan_links
     WHERE ruwasi_plan_id = ? AND ruwasi_student_id = ?
     LIMIT 1 FOR UPDATE`,
    [oldPlanId, studentId],
  );
  if (!planLink) return null;

  const [[activeJob]] = await connection.query(
    `SELECT id FROM nazem_sync_jobs
     WHERE entity_type = 'plan' AND entity_id = ? AND status = 'syncing'
       AND lease_expires_at >= NOW(3)
     LIMIT 1 FOR UPDATE`,
    [oldPlanId],
  );
  if (activeJob) {
    const error = new Error('تجري مزامنة خطة ناظم الآن؛ أعد محاولة حفظ التعديل بعد لحظات.');
    error.statusCode = 409;
    error.code = 'NAZEM_PLAN_SYNC_ACTIVE';
    throw error;
  }

  const teacherId = Number(planLink.teacherId || 0) || null;
  if (['deleted', 'detached'].includes(String(planLink.syncStatus || ''))) return teacherId;

  await connection.query(
    `UPDATE nazem_sync_jobs SET status = 'dismissed', lease_owner = NULL,
      lease_expires_at = NULL, last_error_code = 'RUWASI_PLAN_REPLACED',
      last_error = 'استُبدلت نسخة الخطة المحلية بخطة أحدث.'
     WHERE entity_type = 'plan' AND entity_id = ?
       AND operation_type IN ('plan.upsert', 'plan.delete')
       AND status IN ('pending','retrying','failed','blocked','requires_review','conflict')`,
    [oldPlanId],
  );
  await connection.query(
    `UPDATE nazem_sync_conflicts SET status = 'resolved', resolution = 'ruwasi_plan_replaced',
      resolved_by_role = ?, resolved_by_id = ?, resolved_at = NOW(3)
     WHERE entity_type = 'plan' AND entity_id = ? AND status = 'open'`,
    [String(actor?.role || 'manager'), Number(actor?.id || 0) || null, oldPlanId],
  );
  await connection.query(
    `UPDATE nazem_plan_links SET ruwasi_plan_id = ?, ruwasi_student_id = ?,
      sync_status = 'pending', last_error_code = NULL, last_error = NULL
     WHERE id = ?`,
    [newPlanId, studentId, planLink.id],
  );
  return teacherId;
}

export async function enqueueNazemPlanUpsert(connection, {
  planId,
  studentId,
  actor,
  teacherIdOverride = null,
}) {
  if (!await isNazemIntegrationEnabled(connection)) return null;
  const teacherId = Number(teacherIdOverride || 0) || await resolveNazemTeacherForStudent(
    connection,
    studentId,
    actor?.role === 'supervisor' ? Number(actor.id) : null,
    planId,
  );
  if (!teacherId) return null;
  return enqueueNazemPlanForTeacher(connection, { planId, studentId, teacherId });
}

export async function enqueueNazemPlanDeletion(connection, { planId, studentId, actor }) {
  const [[planLink]] = await connection.query(
    `SELECT teacher_id AS teacherId, nazem_plan_id AS nazemPlanId,
      external_fingerprint AS externalFingerprint
     FROM nazem_plan_links WHERE ruwasi_plan_id = ? AND ruwasi_student_id = ? LIMIT 1`,
    [planId, studentId],
  );
  const teacherId = Number(planLink?.teacherId || 0) || await resolveNazemTeacherForStudent(
    connection,
    studentId,
    actor?.role === 'supervisor' ? Number(actor.id) : null,
    planId,
  );
  if (!teacherId || !planLink) return null;
  if (!planLink.nazemPlanId) {
    await connection.query(
      `UPDATE nazem_plan_links SET sync_status = 'deleted', last_error_code = NULL, last_error = NULL
       WHERE ruwasi_plan_id = ? AND teacher_id = ?`,
      [planId, teacherId],
    );
    return null;
  }
  await connection.query(
    `UPDATE nazem_plan_links SET sync_status = 'requires_review',
      last_error_code = 'LOCAL_PLAN_REMOVED',
      last_error = 'حُذفت الخطة المحلية وتحتاج الخطة الخارجية إلى مراجعة.'
     WHERE ruwasi_plan_id = ? AND teacher_id = ?`,
    [planId, teacherId],
  );
  if (!await isNazemIntegrationEnabled(connection)) return null;
  return enqueueNazemSyncJob(connection, {
    operationType: 'plan.delete',
    entityType: 'plan',
    entityId: planId,
    teacherId,
    studentId,
    payload: { planId, studentId },
    idempotencyKey: `nazem:plan:${planId}:delete:${planLink.externalFingerprint || planLink.nazemPlanId}`,
    maxAttempts: 3,
  });
}

export function resolveNazemRecitationBarrier(rows = [], dailyTaskType = undefined) {
  const primary = rows.filter((row) => row.taskType === dailyTaskType);
  const ready = primary.length > 0
    && primary.every((row) => Number(row.attemptId || 0) > 0);
  const attemptIds = ready ? primary.map((row) => Number(row.attemptId)) : [];
  return {
    ready,
    sourceAttemptId: attemptIds[0] || 0,
    attemptSignature: attemptIds.join('-'),
  };
}

async function loadNazemRecitationBarrier(connection, task, dailyTaskType) {
  const [rows] = await connection.query(
    `SELECT currentTask.id, currentTask.task_type AS taskType, currentTask.track,
      (
        SELECT attempt.id
        FROM student_quran_recitation_attempts attempt
        WHERE attempt.task_id = currentTask.id AND attempt.is_official = 1
        ORDER BY attempt.attempt_number DESC, attempt.id DESC
        LIMIT 1
      ) AS attemptId
     FROM student_quran_tasks currentTask
     WHERE currentTask.plan_id = ? AND currentTask.student_id = ?
       AND currentTask.task_date = ?
       AND currentTask.task_type = ? AND currentTask.track = ?
       AND (currentTask.task_type <> 'review' OR currentTask.id = ?)
     ORDER BY currentTask.id`,
    [task.planId, task.studentId, task.taskDate, dailyTaskType, nazemTaskTrack(task), task.id],
  );
  return resolveNazemRecitationBarrier(rows, dailyTaskType);
}

export async function enqueueNazemRecitation(connection, { attemptId, task, actor }) {
  if (!await isNazemIntegrationEnabled(connection)) return null;
  const submittedTaskType = String(task.taskType || '');
  if (!['memorization', 'review', 'link'].includes(submittedTaskType)) return null;
  const [[attendance]] = await connection.query(
    `SELECT status FROM attendance_records
     WHERE student_id = ? AND record_date = ? LIMIT 1`,
    [task.studentId, task.sessionDate || task.taskDate],
  );
  if (['absent', 'excused'].includes(attendance?.status)) return null;
  const teacherId = await resolveNazemTeacherForStudent(
    connection,
    task.studentId,
    actor?.role === 'supervisor' ? Number(actor.id) : null,
    task.planId,
  );
  if (!teacherId) return null;
  const dailyTaskType = submittedTaskType;
  const [dailyResult] = await connection.query(
    `INSERT INTO nazem_daily_follow_up_links
      (ruwasi_plan_id, ruwasi_student_id, teacher_id, follow_up_date, task_type, track, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [task.planId, task.studentId, teacherId, task.taskDate, dailyTaskType, nazemTaskTrack(task)],
  );
  const dailyFollowUpId = Number(dailyResult.insertId || 0);
  if (!dailyFollowUpId) return null;
  const fingerprint = crypto.createHash('sha256')
    .update(`${teacherId}:${attemptId}:${task.id}:${task.taskDate}`)
    .digest('hex');
  await connection.query(
    `INSERT INTO nazem_recitation_links
      (ruwasi_recitation_id, ruwasi_task_id, ruwasi_plan_id, teacher_id,
       daily_follow_up_id, external_fingerprint, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')
     ON DUPLICATE KEY UPDATE daily_follow_up_id = VALUES(daily_follow_up_id),
       sync_status = IF(sync_status = 'synced', sync_status, 'pending'),
       last_error_code = IF(sync_status = 'synced', last_error_code, NULL),
       last_error = IF(sync_status = 'synced', last_error, NULL)`,
    [attemptId, task.id, task.planId, teacherId, dailyFollowUpId, fingerprint],
  );
  const [[recitationState]] = await connection.query(
    `SELECT recitationLink.sync_status AS syncStatus,
      recitationLink.remote_snapshot AS remoteSnapshot,
      attempt.teacher_completed AS teacherCompleted
     FROM nazem_recitation_links recitationLink
     JOIN student_quran_recitation_attempts attempt
       ON attempt.id = recitationLink.ruwasi_recitation_id
     WHERE recitationLink.ruwasi_recitation_id = ? AND recitationLink.teacher_id = ? LIMIT 1`,
    [attemptId, teacherId],
  );
  const remoteSnapshot = typeof recitationState?.remoteSnapshot === 'string'
    ? JSON.parse(recitationState.remoteSnapshot || '{}')
    : (recitationState?.remoteSnapshot || {});
  const remoteStatus = remoteSnapshot?.status;
  let remoteMatchesLatestAttempt = remoteStatus
    && isNazemFollowUpCompleted(remoteStatus) === Boolean(recitationState?.teacherCompleted);
  if (submittedTaskType === 'link') {
    const [[metric]] = await connection.query(
      `SELECT SUM(actual_link_count) AS count FROM student_quran_tasks
       WHERE plan_id = ? AND student_id = ? AND task_date = ? AND task_type = 'link'`,
      [task.planId, task.studentId, task.taskDate],
    );
    remoteMatchesLatestAttempt = Object.hasOwn(remoteSnapshot?.metrics || {}, 'link')
      && Number(remoteSnapshot.metrics.link) === Number(metric?.count || 0);
  }
  if (recitationState?.syncStatus === 'synced' && (!remoteStatus || remoteMatchesLatestAttempt)) return null;
  await connection.query(
    `UPDATE nazem_recitation_links SET sync_status = 'pending',
      last_error_code = NULL, last_error = NULL
     WHERE ruwasi_recitation_id = ? AND teacher_id = ?`,
    [attemptId, teacherId],
  );
  await connection.query(
    `UPDATE nazem_daily_follow_up_links SET sync_status = 'pending',
      last_error_code = NULL, last_error = NULL
     WHERE id = ?`,
    [dailyFollowUpId],
  );
  const barrier = await loadNazemRecitationBarrier(connection, task, dailyTaskType);
  if (!barrier.ready || !barrier.sourceAttemptId) return null;
  const submissionTarget = await captureRecitationTarget(connection, dailyFollowUpId, barrier.attemptSignature);
  return enqueueNazemSyncJob(connection, {
    operationType: 'recitation.submit',
    entityType: 'recitation_day',
    entityId: dailyFollowUpId,
    teacherId,
    studentId: task.studentId,
    payload: {
      dailyFollowUpId,
      submissionTarget,
      attemptId: barrier.sourceAttemptId,
      taskId: task.id,
      planId: task.planId,
      taskDate: task.taskDate,
      taskType: dailyTaskType,
      force: false,
    },
    idempotencyKey: `nazem:recitation-day:${dailyFollowUpId}:${barrier.attemptSignature}`,
    maxAttempts: 2,
    nextAttemptAt: null,
  });
}

export async function enqueueNazemAttendance(connection, {
  attendanceId,
  studentId,
  date,
  status,
  actor,
  explicitChange = false,
}) {
  if (!await isNazemIntegrationEnabled(connection)) return null;
  const teacherId = await resolveNazemTeacherForStudent(
    connection,
    studentId,
    actor?.role === 'supervisor' ? Number(actor.id) : null,
  );
  if (!teacherId) return null;
  const [[planLink]] = await connection.query(
    `SELECT ruwasi_plan_id AS planId, nazem_plan_id AS nazemPlanId
     FROM nazem_plan_links
     WHERE teacher_id = ? AND ruwasi_student_id = ? AND sync_status = 'synced'
     ORDER BY id DESC LIMIT 1`,
    [teacherId, studentId],
  );
  const [[discoveredPlan]] = planLink?.nazemPlanId ? [[null]] : await connection.query(
    `SELECT nazem_plan_id AS nazemPlanId
     FROM nazem_plan_candidates
     WHERE teacher_id = ? AND ruwasi_student_id = ?
       AND discovery_status IN ('discovered','requires_review','imported')
       AND nazem_plan_id IS NOT NULL
     ORDER BY updated_at DESC, id DESC LIMIT 1`,
    [teacherId, studentId],
  );
  const nazemPlanId = planLink?.nazemPlanId || discoveredPlan?.nazemPlanId || null;
  await connection.query(
    `UPDATE nazem_sync_jobs SET status = 'dismissed', lease_owner = NULL,
      lease_expires_at = NULL, last_error_code = 'RUWASI_ATTENDANCE_REPLACED',
      last_error = 'استُبدلت حالة الحضور بحالة أحدث في المنصة.'
     WHERE operation_type = 'attendance.submit' AND entity_type = 'attendance'
       AND entity_id = ? AND status IN ('pending','retrying','failed','blocked','requires_review')`,
    [attendanceId],
  );
  return enqueueNazemSyncJob(connection, {
    operationType: 'attendance.submit',
    entityType: 'attendance',
    entityId: attendanceId,
    teacherId,
    studentId,
    payload: { attendanceId, studentId, planId: planLink?.planId || null, nazemPlanId, date, status, explicitChange },
    idempotencyKey: `nazem:attendance:${attendanceId}:${status}:${crypto.randomUUID()}`,
    nextAttemptAt: nazemPlanId ? null : new Date(Date.now() + (5 * 60_000)),
  });
}

export async function enqueueMissingNazemAttendance(connection, {
  teacherId,
  studentId,
}) {
  const [records] = await connection.query(
    `SELECT attendance.id, DATE_FORMAT(attendance.record_date, '%Y-%m-%d') AS date,
      attendance.status
     FROM attendance_records attendance
     WHERE attendance.student_id = ?
       AND attendance.record_date >= ?
       AND NOT EXISTS (
         SELECT 1 FROM nazem_sync_jobs job
         WHERE job.operation_type = 'attendance.submit'
           AND job.entity_type = 'attendance' AND job.entity_id = attendance.id
           AND job.status <> 'dismissed'
           AND JSON_UNQUOTE(JSON_EXTRACT(job.payload_json, '$.status')) = attendance.status
       )
     ORDER BY attendance.record_date, attendance.id`,
    [studentId, shiftDateOnly(getBusinessDate(), -14)],
  );
  let enqueued = 0;
  for (const record of records) {
    const jobId = await enqueueNazemAttendance(connection, {
      attendanceId: Number(record.id),
      studentId,
      date: record.date,
      status: record.status,
      actor: { role: 'supervisor', id: teacherId },
    });
    if (jobId) enqueued += 1;
  }
  return enqueued;
}

export async function recoverExpiredNazemJobs(connection = db()) {
  await connection.query(
      `UPDATE nazem_sync_jobs SET
        status = IF(attempt_count >= max_attempts, 'failed', 'retrying'),
        lease_owner = NULL, lease_expires_at = NULL,
        last_error_code = IF(attempt_count >= max_attempts,
          COALESCE(last_error_code, 'NAZEM_LEASE_EXPIRED'), last_error_code),
        last_error = IF(attempt_count >= max_attempts,
          COALESCE(last_error, 'انتهت مهلة عملية ناظم بعد استنفاد المحاولات.'), last_error)
       WHERE status = 'syncing' AND (lease_expires_at IS NULL OR lease_expires_at < NOW(3))`,
  );
  await connection.query(
      `UPDATE nazem_sync_jobs SET status = 'failed', lease_owner = NULL, lease_expires_at = NULL,
        last_error_code = COALESCE(last_error_code, 'NAZEM_RETRIES_EXHAUSTED'),
        last_error = COALESCE(last_error, 'استُنفدت محاولات مزامنة ناظم.')
       WHERE status = 'retrying' AND attempt_count >= max_attempts`,
  );
}

export async function claimNextNazemJob(connection = db()) {
  await connection.beginTransaction();
  try {
    const [[job]] = await connection.query(
      `SELECT id, sync_uuid AS syncUuid, operation_type AS operationType,
        entity_type AS entityType, entity_id AS entityId, teacher_id AS teacherId,
        student_id AS studentId, payload_json AS payload, attempt_count AS attemptCount,
        max_attempts AS maxAttempts,
        TIMESTAMPDIFF(MICROSECOND, created_at, NOW(3)) / 1000 AS queueWaitMs
       FROM nazem_sync_jobs job
       WHERE job.status IN (?, ?)
         AND job.attempt_count < job.max_attempts
         AND job.next_attempt_at <= NOW(3)
         AND (job.lease_expires_at IS NULL OR job.lease_expires_at < NOW(3))
         AND NOT EXISTS (
           SELECT 1 FROM nazem_sync_jobs active
           WHERE active.teacher_id = job.teacher_id AND active.id <> job.id
             AND active.status = 'syncing' AND active.lease_expires_at >= NOW(3)
         )
       ORDER BY CASE
         WHEN JSON_UNQUOTE(JSON_EXTRACT(job.payload_json, '$.requestedFrom')) = 'student-plan-import' THEN 0
         WHEN job.operation_type = 'account.verify' THEN 1
         WHEN job.operation_type = 'attendance.submit' THEN 2
         WHEN job.operation_type = 'recitation.submit' THEN 3
         WHEN JSON_UNQUOTE(JSON_EXTRACT(job.payload_json, '$.requestedFrom')) = 'teacher-evaluation' THEN 4
         WHEN job.operation_type IN ('plan.upsert', 'plan.delete') THEN 5
         WHEN job.operation_type = 'account.discover_plans' THEN 8
         WHEN job.operation_type = 'account.reconcile' THEN 9
         ELSE 5
       END,
         job.next_attempt_at, job.id
       LIMIT 1 FOR UPDATE SKIP LOCKED`,
      CLAIMABLE_STATUSES,
    );
    if (!job) {
      await connection.commit();
      return null;
    }
    await connection.query(
      `UPDATE nazem_sync_jobs SET status = 'syncing', lease_owner = ?,
        lease_expires_at = DATE_ADD(NOW(3), INTERVAL 3 MINUTE),
        attempt_count = attempt_count + 1, last_started_at = NOW(3),
        progress_percent = 5, progress_stage = 'connecting'
       WHERE id = ?`,
      [WORKER_ID, job.id],
    );
    await connection.commit();
    return {
      ...job,
      attemptCount: Number(job.attemptCount || 0) + 1,
      maxAttempts: Number(job.maxAttempts || 4),
      payload: typeof job.payload === 'string' ? JSON.parse(job.payload) : (job.payload || {}),
      leaseOwner: WORKER_ID,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

export async function updateNazemJobProgress(connection, job, percent, stage) {
  const normalizedPercent = Math.max(0, Math.min(99, Math.round(Number(percent || 0))));
  const [result] = await connection.query(
    `UPDATE nazem_sync_jobs SET progress_percent = ?, progress_stage = ?
     WHERE id = ? AND status = 'syncing' AND lease_owner = ?`,
    [normalizedPercent, String(stage || '').slice(0, 80) || null, job.id, job.leaseOwner],
  );
  return Boolean(result.affectedRows);
}

export async function renewNazemJobLease(connection, job) {
  const [result] = await connection.query(
    `UPDATE nazem_sync_jobs SET lease_expires_at = DATE_ADD(NOW(3), INTERVAL 3 MINUTE),
      last_heartbeat_at = NOW(3)
     WHERE id = ? AND status = 'syncing' AND lease_owner = ?`,
    [job.id, job.leaseOwner],
  );
  return Boolean(result.affectedRows);
}

async function recordJobEvent(connection, job, status, error = null, metadata = null) {
  await connection.query(
    `INSERT INTO nazem_sync_events
      (job_id, teacher_id, student_id, operation_type, status, attempt_number, error_code, message, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      job.id,
      job.teacherId,
      job.studentId,
      job.operationType,
      status,
      job.attemptCount,
      error?.code || null,
      error?.message ? String(error.message).slice(0, 500) : null,
      metadata ? JSON.stringify(metadata) : null,
    ],
  );
}

export async function completeNazemJob(connection, job, metadata = null) {
  const [result] = await connection.query(
    `UPDATE nazem_sync_jobs SET status = 'synced', lease_owner = NULL, lease_expires_at = NULL,
      last_error_code = NULL, last_error = NULL, last_succeeded_at = NOW(3),
      progress_percent = 100, progress_stage = 'completed'
     WHERE id = ? AND status = 'syncing' AND lease_owner = ?`,
    [job.id, job.leaseOwner],
  );
  if (!result.affectedRows) return false;
  await connection.query(
    `UPDATE nazem_sync_jobs SET status = 'dismissed', lease_owner = NULL, lease_expires_at = NULL,
      last_error_code = 'NAZEM_JOB_SUPERSEDED',
      last_error = 'أُغلقت تلقائيًا بعد نجاح عملية أحدث لنفس السجل.'
     WHERE teacher_id = ? AND id < ?
       AND status IN ('failed','blocked','requires_review','conflict')
       AND (
         (? = 'account' AND entity_type = 'account')
         OR (operation_type = ? AND entity_type = ? AND entity_id <=> ?)
       )`,
    [job.teacherId, job.id, job.entityType, job.operationType, job.entityType, job.entityId],
  );
  await recordJobEvent(connection, job, 'synced', null, metadata);
  return true;
}

export async function failNazemJob(connection, job, error) {
  const retryable = Boolean(error?.retryable) && job.attemptCount < job.maxAttempts;
  const _resolveStatus = () => {
    if (retryable) {
      return 'retrying';
    }
    if (error?.retryable) {
      return 'failed';
    }
    return error?.syncStatus || 'failed';
  };
  const status = _resolveStatus();
  const delaySeconds = retryable
    ? Math.min(45, 5 * (3 ** Math.max(0, job.attemptCount - 1)))
    : 0;
  const [result] = await connection.query(
    `UPDATE nazem_sync_jobs SET status = ?, lease_owner = NULL, lease_expires_at = NULL,
      next_attempt_at = DATE_ADD(NOW(3), INTERVAL ? SECOND), last_error_code = ?, last_error = ?
     WHERE id = ? AND status = 'syncing' AND lease_owner = ?`,
    [status, delaySeconds, error?.code || 'NAZEM_ERROR', String(error?.message || 'تعذرت المزامنة.').slice(0, 500), job.id, job.leaseOwner],
  );
  if (!result.affectedRows) return null;
  await recordJobEvent(connection, job, status, error, { diagnostics: nazemErrorDiagnostics(error) });
  if (NAZEM_STRUCTURAL_ERROR_CODES.has(error?.code)) {
    await registerNazemCircuitFailure(connection, error);
  }
  return status;
}

export async function cleanupNazemHistory(connection) {
  const eventRetentionDays = Math.max(30, Number(process.env.NAZEM_EVENT_RETENTION_DAYS || 180));
  const jobRetentionDays = Math.max(14, Number(process.env.NAZEM_JOB_RETENTION_DAYS || 90));
  const candidateRetentionDays = Math.max(14, Number(process.env.NAZEM_CANDIDATE_RETENTION_DAYS || 60));
  await connection.query(
    'DELETE FROM nazem_sync_events WHERE created_at < DATE_SUB(NOW(3), INTERVAL ? DAY)',
    [eventRetentionDays],
  );
  await connection.query(
    `DELETE FROM nazem_sync_jobs
     WHERE status = 'synced' AND last_succeeded_at < DATE_SUB(NOW(3), INTERVAL ? DAY)`,
    [jobRetentionDays],
  );
  await connection.query(
    `DELETE candidate FROM nazem_student_candidates candidate
     LEFT JOIN nazem_student_links link ON link.teacher_id = candidate.teacher_id
       AND link.nazem_student_id = candidate.nazem_student_id AND link.status = 'linked'
     WHERE link.id IS NULL AND candidate.last_seen_at < DATE_SUB(NOW(3), INTERVAL ? DAY)`,
    [candidateRetentionDays],
  );
}

export const NAZEM_ADAPTER_CIRCUIT_KEY = 'nazem-api-v2';

export async function registerNazemCircuitSuccess(connection) {
  await connection.query(
    `INSERT INTO nazem_circuit_breakers (adapter_key, state, consecutive_failures, window_total)
     VALUES (?, 'closed', 0, 1)
     ON DUPLICATE KEY UPDATE consecutive_failures = 0, window_total = window_total + 1,
       state = 'closed', opened_at = NULL, retry_after = NULL,
       last_error_code = NULL, last_error = NULL`,
    [NAZEM_ADAPTER_CIRCUIT_KEY],
  );
}

export async function registerNazemCircuitFailure(connection, error) {
  await connection.query(
    `INSERT INTO nazem_circuit_breakers
      (adapter_key, state, consecutive_failures, window_failures, window_total, last_error_code, last_error)
     VALUES (?, 'closed', 1, 1, 1, ?, ?)
     ON DUPLICATE KEY UPDATE consecutive_failures = consecutive_failures + 1,
       window_failures = window_failures + 1, window_total = window_total + 1,
       last_error_code = VALUES(last_error_code), last_error = VALUES(last_error),
       state = IF(consecutive_failures >= 5, 'open', state),
       opened_at = IF(consecutive_failures >= 5, NOW(3), opened_at),
       retry_after = IF(consecutive_failures >= 5, DATE_ADD(NOW(3), INTERVAL 30 MINUTE), retry_after)`,
    [NAZEM_ADAPTER_CIRCUIT_KEY, error?.code || 'NAZEM_ERROR', String(error?.message || '').slice(0, 500)],
  );
}

export const nazemWorkerId = WORKER_ID;
