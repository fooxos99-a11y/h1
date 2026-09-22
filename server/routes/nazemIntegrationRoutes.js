import { loadNazemReconciliationReport } from '../services/nazemReconciliationReport.js';
import crypto from 'node:crypto';
import express from 'express';
import {
  calculateNameMatchConfidence,
  findUniqueArabicPersonNameMatch,
  isNazemFollowUpCompleted,
  isNazemExternalStudentId,
  normalizeArabicPersonName,
} from '../../shared/nazem-integration.js';
import { encryptNazemSecret } from '../integrations/nazem/crypto.js';
import { createNazemIdentityFingerprint } from '../integrations/nazem/identity.js';
import {
  enqueueMissingNazemAttendance,
  enqueueNazemSyncJob,
  NAZEM_ADAPTER_CIRCUIT_KEY,
} from '../integrations/nazem/queue.js';
import { getNazemRuntimeReadiness } from '../integrations/nazem/runtime.js';
import { buildNazemLogEntries } from '../integrations/nazem/log.js';
import { applyRemoteAttendanceToRuwasi } from '../integrations/nazem/service.js';
import { generateThreeDigitLoginNumber, loadUsedLoginNumbers } from '../services/loginNumbers.js';
import { normalizeOptionalAccountNumber } from '../../shared/account-contact.js';
import { normalizeNazemLinkCount } from '../../shared/nazem-link-count.js';
import { nazemPlanBundleMatches } from '../integrations/nazem/adapter.js';

const parseBoolean = (value) => value === true || value === 'true' || value === 1 || value === '1';

const invalid = (message) => {
  const error = new Error(message);
  error.statusCode = 422;
  return error;
};

const parseSnapshot = (value) => {
  if (!value || typeof value === 'object') return value || null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const cleanCommitteeName = (value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 160);

const candidateContactProfile = (candidate) => {
  const profile = parseSnapshot(candidate?.remoteSnapshot) || {};
  return {
    ...profile,
    nationalId: normalizeOptionalAccountNumber(profile.nationalId, 'رقم الهوية'),
    phone: normalizeOptionalAccountNumber(profile.phone, 'رقم الجوال'),
  };
};

async function teacherExists(connection, teacherId) {
  const [[teacher]] = await connection.query(
    "SELECT id, name FROM supervisors WHERE id = ? AND role = 'supervisor' LIMIT 1",
    [teacherId],
  );
  return teacher || null;
}

export async function importDiscoveredNazemPlan(connection, {
  teacherId,
  candidateId,
  actor,
  importPlanCandidate,
}) {
  if (typeof importPlanCandidate !== 'function') throw invalid('استيراد خطط ناظم غير متاح.');
  const [[candidate]] = await connection.query(
    `SELECT candidate.id, candidate.teacher_id AS teacherId,
      candidate.ruwasi_student_id AS studentId,
      candidate.nazem_student_id AS nazemStudentId,
      candidate.nazem_plan_id AS nazemPlanId,
      candidate.remote_snapshot AS remoteSnapshot,
      candidate.progress_snapshot AS progressSnapshot,
      candidate.discovery_status AS status
     FROM nazem_plan_candidates candidate
     JOIN nazem_accounts account ON account.teacher_id = candidate.teacher_id AND account.status = 'connected'
     WHERE candidate.id = ? AND candidate.teacher_id = ? LIMIT 1 FOR UPDATE`,
    [candidateId, teacherId],
  );
  if (!candidate?.studentId) throw invalid('طابق طالب ناظم مع طالب المنصة قبل استيراد الخطة.');
  if (!['discovered', 'requires_review'].includes(candidate.status)) {
    const error = new Error('الخطة حُسمت سابقًا؛ حدّث قائمة الخطط.');
    error.statusCode = 409;
    throw error;
  }
  const result = await importPlanCandidate(connection, {
    ...candidate,
    remoteSnapshot: parseSnapshot(candidate.remoteSnapshot),
    progressSnapshot: parseSnapshot(candidate.progressSnapshot),
  });
  const actorRole = String(actor?.role || 'system');
  const actorId = Number(actor?.id || 0) || null;
  await connection.query(
    `UPDATE nazem_plan_candidates SET discovery_status = 'imported',
      last_error_code = NULL, last_error = NULL, resolved_by_role = ?, resolved_by_id = ?,
      resolved_at = NOW(3) WHERE id = ?`,
    [actorRole, actorId, candidate.id],
  );
  await connection.query(
    `UPDATE nazem_plan_candidates SET discovery_status = 'ignored',
      last_error_code = NULL, last_error = NULL, resolved_by_role = ?, resolved_by_id = ?,
      resolved_at = NOW(3)
     WHERE teacher_id = ? AND ruwasi_student_id = ? AND id <> ?
       AND discovery_status IN ('discovered','requires_review')`,
    [actorRole, actorId, teacherId, candidate.studentId, candidate.id],
  );
  return { candidate, result };
}

export async function importReadyNazemPlans(connection, {
  teacherId = null,
  actor = { role: 'system', id: null },
  importPlanCandidate,
  limit = 200,
} = {}) {
  const params = [];
  const teacherFilter = teacherId ? 'AND candidate.teacher_id = ?' : '';
  if (teacherId) params.push(Number(teacherId));
  params.push(Math.max(1, Math.min(200, Number(limit || 200))));
  const [candidates] = await connection.query(
    `SELECT candidate.id, candidate.teacher_id AS teacherId
     FROM nazem_plan_candidates candidate
     JOIN nazem_accounts account
       ON account.teacher_id = candidate.teacher_id AND account.status = 'connected'
     JOIN app_settings setting
       ON setting.setting_key = 'nazemIntegrationEnabled' AND setting.setting_value = 'true'
     LEFT JOIN student_quran_plans localPlan
       ON localPlan.student_id = candidate.ruwasi_student_id AND localPlan.status = 'active'
     WHERE (
         (candidate.discovery_status = 'discovered' AND candidate.last_error_code IS NULL)
         OR (
           candidate.discovery_status = 'requires_review'
           AND candidate.last_error_code IN ('NAZEM_AUTO_IMPORT_REVIEW', 'NAZEM_BULK_IMPORT_REVIEW')
           AND candidate.last_error LIKE 'تعذر مطابقة%مع المصحف%'
         )
       )
       AND candidate.ruwasi_student_id IS NOT NULL
       AND JSON_EXTRACT(candidate.remote_snapshot, '$.primary') IS NOT NULL
       AND localPlan.id IS NULL
       ${teacherFilter}
       AND NOT EXISTS (
         SELECT 1 FROM nazem_sync_jobs activeJob
         WHERE activeJob.teacher_id = candidate.teacher_id
           AND activeJob.status = 'syncing'
           AND activeJob.lease_expires_at >= NOW(3)
       )
       AND NOT EXISTS (
         SELECT 1 FROM nazem_plan_candidates sibling
         WHERE sibling.teacher_id = candidate.teacher_id
           AND sibling.ruwasi_student_id = candidate.ruwasi_student_id
           AND sibling.id <> candidate.id
           AND sibling.discovery_status IN ('discovered','requires_review')
       )
     ORDER BY candidate.id
     LIMIT ?
     FOR UPDATE`,
    params,
  );
  const imported = [];
  const review = [];
  for (const candidate of candidates) {
    const savepoint = `nazem_auto_plan_${Number(candidate.id)}`;
    await connection.query(`SAVEPOINT ${savepoint}`);
    try {
      const { candidate: importedCandidate } = await importDiscoveredNazemPlan(connection, {
        teacherId: Number(candidate.teacherId),
        candidateId: Number(candidate.id),
        actor,
        importPlanCandidate,
      });
      await connection.query(`RELEASE SAVEPOINT ${savepoint}`);
      imported.push({ candidateId: Number(candidate.id), studentId: Number(importedCandidate.studentId) });
    } catch (error) {
      await connection.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      await connection.query(
        `UPDATE nazem_plan_candidates SET discovery_status = 'requires_review',
          last_error_code = ?, last_error = ? WHERE id = ?`,
        [String(error.code || 'NAZEM_AUTO_IMPORT_REVIEW').slice(0, 80),
          String(error.message || 'تعذر استيراد الخطة.').slice(0, 500), candidate.id],
      );
      await connection.query(`RELEASE SAVEPOINT ${savepoint}`);
      review.push({ candidateId: Number(candidate.id), message: error.message || 'تعذر استيراد الخطة.' });
    }
  }
  return { imported, review };
}

export function createNazemIntegrationRouter({ db, requirePermission, importPlanCandidate }) {
  const router = express.Router();
  router.get('/reconciliation', requirePermission('reports'), async (req, res, next) => {
    try { res.json(await loadNazemReconciliationReport(db(), req.auth, req.query)); }
    catch (error) { next(error); }
  });
  const requireSettings = requirePermission('settings');
  const enqueueAccountVerification = async (connection, teacherId, payload = {}) => {
    const [[active]] = await connection.query(
      `SELECT id, status FROM nazem_sync_jobs
       WHERE teacher_id = ? AND operation_type = 'account.verify'
         AND status IN ('pending','syncing','retrying')
       ORDER BY CASE WHEN status = 'syncing' THEN 0 ELSE 1 END, id DESC
       LIMIT 1 FOR UPDATE`,
      [teacherId],
    );
    if (active) {
      await connection.query(
        `UPDATE nazem_sync_jobs SET status = 'dismissed', lease_owner = NULL,
          lease_expires_at = NULL, last_error_code = 'NAZEM_VERIFY_DEDUPLICATED',
          last_error = 'تم دمج طلب التحقق مع الطلب الأحدث.'
         WHERE teacher_id = ? AND operation_type = 'account.verify'
           AND status IN ('pending','retrying') AND id <> ?`,
        [teacherId, active.id],
      );
      return Number(active.id);
    }
    return enqueueNazemSyncJob(connection, {
      operationType: 'account.verify',
      entityType: 'account',
      entityId: teacherId,
      teacherId,
      payload,
      idempotencyKey: `nazem:account:${teacherId}:verify:${crypto.randomUUID()}`,
      maxAttempts: 3,
    });
  };
  const requirePlanStatusAccess = (req, res, next) => {
    if (['manager', 'supervisor'].includes(req.auth?.role)) return next();
    return requirePermission('studentPlans')(req, res, next);
  };
  const assertNoActivePlanImportJob = async (connection, teacherId) => {
    const [[activeJob]] = await connection.query(
      `SELECT id FROM nazem_sync_jobs
       WHERE teacher_id = ? AND status = 'syncing' AND lease_expires_at >= NOW(3)
         AND operation_type IN ('account.verify', 'plan.upsert', 'plan.delete')
       LIMIT 1 FOR UPDATE`,
      [teacherId],
    );
    if (activeJob) {
      const error = new Error('انتظر اكتمال مزامنة المعلم الحالية قبل استيراد الخطة.');
      error.statusCode = 409;
      throw error;
    }
  };
  const importDiscoveredPlan = (connection, options) => importDiscoveredNazemPlan(connection, {
    ...options,
    importPlanCandidate,
  });

  router.get('/config', requireSettings, async (_req, res, next) => {
    try {
      const [[setting]] = await db().query(
        "SELECT setting_value AS value FROM app_settings WHERE setting_key = 'nazemIntegrationEnabled' LIMIT 1",
      );
      const [[circuit]] = await db().query(
        `SELECT state, consecutive_failures AS consecutiveFailures,
          DATE_FORMAT(retry_after, '%Y-%m-%d %H:%i:%s') AS retryAfter,
          last_error_code AS lastErrorCode, last_error AS lastError
         FROM nazem_circuit_breakers WHERE adapter_key = ? LIMIT 1`,
        [NAZEM_ADAPTER_CIRCUIT_KEY],
      );
      const runtime = await getNazemRuntimeReadiness();
      res.json({
        enabled: setting?.value === 'true',
        circuit: circuit || { state: 'closed' },
        runtime,
      });
    } catch (error) {
      next(error);
    }
  });

  router.put('/config', requireSettings, async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      const enabled = parseBoolean(req.body.enabled);
      if (enabled) {
        const runtime = await getNazemRuntimeReadiness();
        if (!runtime.ready) {
          const error = new Error(runtime.issues.join(' '));
          error.statusCode = 503;
          throw error;
        }
      }
      await connection.beginTransaction();
      const [currentSettingRows] = await connection.query(
        `SELECT setting_key AS settingKey, setting_value AS settingValue
         FROM app_settings
         WHERE setting_key IN ('nazemIntegrationEnabled', 'recitationAmountDay', 'recitationAmountDayBeforeNazem')`,
      );
      const currentSettings = Object.fromEntries(
        currentSettingRows.map((row) => [row.settingKey, row.settingValue]),
      );
      const wasEnabled = currentSettings.nazemIntegrationEnabled === 'true';
      await connection.query(
        `INSERT INTO app_settings (setting_key, setting_value) VALUES ('nazemIntegrationEnabled', ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [String(enabled)],
      );
      if (enabled) {
        if (!wasEnabled) {
          const previousRecitationAmountDay = ['same_day', 'previous_day'].includes(currentSettings.recitationAmountDay)
            ? currentSettings.recitationAmountDay
            : 'previous_day';
          await connection.query(
            `INSERT INTO app_settings (setting_key, setting_value)
             VALUES ('recitationAmountDayBeforeNazem', ?)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
            [previousRecitationAmountDay],
          );
        }
        await connection.query(
          `INSERT INTO app_settings (setting_key, setting_value) VALUES
            ('recitationAmountDay', 'same_day')
           ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        );
        const [accounts] = await connection.query('SELECT teacher_id AS teacherId FROM nazem_accounts');
        for (const account of accounts) {
          await enqueueAccountVerification(connection, account.teacherId);
        }
      } else if (wasEnabled) {
        const restoredRecitationAmountDay = ['same_day', 'previous_day'].includes(currentSettings.recitationAmountDayBeforeNazem)
          ? currentSettings.recitationAmountDayBeforeNazem
          : 'previous_day';
        await connection.query(
          `INSERT INTO app_settings (setting_key, setting_value)
           VALUES ('recitationAmountDay', ?)
           ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
          [restoredRecitationAmountDay],
        );
        await connection.query(
          `UPDATE nazem_sync_jobs
           SET status = 'dismissed', lease_owner = NULL, lease_expires_at = NULL,
             last_error_code = 'NAZEM_DISABLED', last_error = 'أوقفت المزامنة بعد تعطيل تكامل ناظم.'
           WHERE status IN ('pending', 'retrying')`,
        );
      }
      const _resolveRecitationAmountDay = () => {
        if (enabled) {
          return 'same_day';
        }
        if (wasEnabled) {
          if (['same_day', 'previous_day'].includes(currentSettings.recitationAmountDayBeforeNazem)) {
            return currentSettings.recitationAmountDayBeforeNazem;
          }
          return 'previous_day';
        }
        if (['same_day', 'previous_day'].includes(currentSettings.recitationAmountDay)) {
          return currentSettings.recitationAmountDay;
        }
        return 'previous_day';
      };
      const recitationAmountDay = _resolveRecitationAmountDay();
      await connection.commit();
      res.json({ enabled, recitationAmountDay });
    } catch (error) {
      await connection.rollback();
      next(error);
    } finally {
      connection.release();
    }
  });

  router.get('/accounts', requireSettings, async (_req, res, next) => {
    try {
      const [rows] = await db().query(
        `SELECT teacher.id AS teacherId, teacher.name AS teacherName,
          account.status, account.external_teacher_name AS externalTeacherName,
          account.external_organization_name AS externalOrganizationName,
          TIMESTAMPDIFF(SECOND, account.updated_at, NOW(3)) AS connectionAgeSeconds,
          DATE_FORMAT(account.last_verified_at, '%Y-%m-%d %H:%i') AS lastVerifiedAt,
          DATE_FORMAT(account.last_successful_login_at, '%Y-%m-%d %H:%i') AS lastSuccessfulLoginAt,
          DATE_FORMAT(syncSummary.lastPlanSyncAt, '%Y-%m-%d %H:%i') AS lastPlanSyncAt,
          account.last_error_code AS lastErrorCode, account.last_error AS lastError,
          account.identity_confirmed_at AS identityConfirmedAt,
          COALESCE(studentLinkSummary.linkedStudents, 0) AS linkedStudents,
          COALESCE(studentCandidateSummary.remoteStudents, 0) AS remoteStudents,
          COALESCE(planCandidateSummary.discoveredPlans, 0) AS discoveredPlans,
          COALESCE(planCandidateSummary.planIssues, 0) AS planIssues,
          COALESCE(syncIssueSummary.syncIssues, 0) AS syncIssues,
          COALESCE(planLinkSummary.linkedPlans, 0) AS linkedPlans
         FROM supervisors teacher
         LEFT JOIN nazem_accounts account ON account.teacher_id = teacher.id
         LEFT JOIN (
           SELECT teacher_id, COUNT(*) AS linkedStudents
           FROM nazem_student_links
           WHERE status = 'linked'
           GROUP BY teacher_id
         ) studentLinkSummary ON studentLinkSummary.teacher_id = teacher.id
         LEFT JOIN (
           SELECT teacher_id, COUNT(*) AS remoteStudents
           FROM nazem_student_candidates
           GROUP BY teacher_id
         ) studentCandidateSummary ON studentCandidateSummary.teacher_id = teacher.id
         LEFT JOIN (
           SELECT teacher_id,
             SUM(discovery_status <> 'stale') AS discoveredPlans,
             SUM(discovery_status = 'requires_review'
               AND COALESCE(last_error_code, '') <> 'NAZEM_PLAN_STUDENT_UNMATCHED') AS planIssues
           FROM nazem_plan_candidates
           GROUP BY teacher_id
         ) planCandidateSummary ON planCandidateSummary.teacher_id = teacher.id
         LEFT JOIN (
           SELECT teacher_id, MAX(last_succeeded_at) AS lastPlanSyncAt
           FROM nazem_sync_jobs
           WHERE operation_type IN ('account.reconcile', 'account.discover_plans', 'account.refresh_followups')
             AND status = 'synced'
           GROUP BY teacher_id
         ) syncSummary ON syncSummary.teacher_id = teacher.id
         LEFT JOIN (
           SELECT latest.teacher_id, COUNT(*) AS syncIssues
           FROM (
             SELECT teacher_id, operation_type, entity_type, entity_id, MAX(id) AS latestId
             FROM nazem_sync_jobs
             GROUP BY teacher_id, operation_type, entity_type, entity_id
           ) latest
           JOIN nazem_sync_jobs syncJob ON syncJob.id = latest.latestId
           WHERE syncJob.status IN ('failed','blocked','requires_review','conflict')
           GROUP BY latest.teacher_id
         ) syncIssueSummary ON syncIssueSummary.teacher_id = teacher.id
         LEFT JOIN (
           SELECT teacher_id, COUNT(*) AS linkedPlans
           FROM nazem_plan_links
           WHERE sync_status = 'synced'
           GROUP BY teacher_id
         ) planLinkSummary ON planLinkSummary.teacher_id = teacher.id
         WHERE teacher.role = 'supervisor'
         ORDER BY teacher.name`,
      );
      res.json(rows.map((row) => ({
        ...row,
        connectionAgeSeconds: Number(row.connectionAgeSeconds || 0),
        linkedStudents: Number(row.linkedStudents || 0),
        remoteStudents: Number(row.remoteStudents || 0),
        discoveredPlans: Number(row.discoveredPlans || 0),
        planIssues: Number(row.planIssues || 0),
        syncIssues: Number(row.syncIssues || 0),
        linkedPlans: Number(row.linkedPlans || 0),
      })));
    } catch (error) {
      next(error);
    }
  });

  router.get('/accounts/:teacherId/issues', requireSettings, async (req, res, next) => {
    try {
      const teacherId = Number(req.params.teacherId || 0);
      const [[account]] = await db().query(
        `SELECT status, last_error_code AS lastErrorCode, last_error AS lastError,
          DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i') AS lastSeenAt
         FROM nazem_accounts WHERE teacher_id = ? LIMIT 1`,
        [teacherId],
      );
      if (!account) return res.status(404).json({ message: 'حساب ناظم غير مرتبط.' });
      const [studentIssues] = await db().query(
        `SELECT candidate.id, 'plan' AS issueKind,
          candidate.nazem_student_id AS studentExternalId,
          candidate.nazem_student_name AS studentName,
          student.external_circle_name AS circleName, candidate.nazem_plan_id AS planExternalId,
          candidate.last_error_code AS errorCode, candidate.last_error AS message,
          DATE_FORMAT(candidate.last_seen_at, '%Y-%m-%d %H:%i') AS lastSeenAt
         FROM nazem_plan_candidates candidate
         LEFT JOIN nazem_student_candidates student
           ON student.teacher_id = candidate.teacher_id
          AND student.nazem_student_id = candidate.nazem_student_id
         WHERE candidate.teacher_id = ? AND candidate.discovery_status = 'requires_review'
           AND COALESCE(candidate.last_error_code, '') <> 'NAZEM_PLAN_STUDENT_UNMATCHED'
         ORDER BY candidate.last_seen_at DESC, candidate.id DESC`,
        [teacherId],
      );
      const [jobIssues] = await db().query(
        `SELECT job.id, job.id AS jobId, job.status AS status, 'job' AS issueKind,
          studentLink.nazem_student_id AS studentExternalId,
          COALESCE(student.name, teacher.name) AS studentName,
          NULL AS circleName, NULL AS planExternalId,
          job.last_error_code AS errorCode, job.last_error AS message,
          DATE_FORMAT(job.updated_at, '%Y-%m-%d %H:%i') AS lastSeenAt
         FROM nazem_sync_jobs job
         JOIN supervisors teacher ON teacher.id = job.teacher_id
         LEFT JOIN students student ON student.id = job.student_id
         LEFT JOIN nazem_student_links studentLink
           ON studentLink.teacher_id = job.teacher_id
          AND studentLink.ruwasi_student_id = job.student_id
          AND studentLink.status = 'linked'
         WHERE job.teacher_id = ?
           AND (job.status IN ('failed','blocked','requires_review','conflict')
             OR (job.status = 'retrying' AND job.last_error IS NOT NULL))
           AND NOT EXISTS (
             SELECT 1 FROM nazem_sync_jobs newerJob
             WHERE newerJob.teacher_id = job.teacher_id
               AND newerJob.operation_type = job.operation_type
               AND newerJob.entity_type = job.entity_type
               AND newerJob.entity_id <=> job.entity_id
               AND newerJob.id > job.id
           )
         ORDER BY job.updated_at DESC, job.id DESC`,
        [teacherId],
      );
      return res.json({
        accountIssue: account.lastError ? {
          errorCode: account.lastErrorCode || '',
          message: account.lastError,
          lastSeenAt: account.lastSeenAt,
        } : null,
        studentIssues: [...jobIssues, ...studentIssues],
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/accounts/:teacherId/issues/:studentExternalId/retry', requireSettings, async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      const teacherId = Number(req.params.teacherId || 0);
      const studentExternalId = String(req.params.studentExternalId || '').trim();
      if (!teacherId || !isNazemExternalStudentId(studentExternalId)) {
        throw invalid('معرّف طالب ناظم غير صالح.');
      }
      await connection.beginTransaction();
      const [[account]] = await connection.query(
        "SELECT id FROM nazem_accounts WHERE teacher_id = ? AND status = 'connected' LIMIT 1 FOR UPDATE",
        [teacherId],
      );
      if (!account) throw invalid('حساب المعلم غير متصل بناظم.');
      const [[activeJob]] = await connection.query(
        `SELECT id FROM nazem_sync_jobs
         WHERE teacher_id = ? AND operation_type = 'account.discover_plans'
           AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.studentExternalId')) = ?
           AND (status IN ('pending','retrying')
             OR (status = 'syncing' AND lease_expires_at >= NOW(3)))
         ORDER BY id DESC LIMIT 1 FOR UPDATE`,
        [teacherId, studentExternalId],
      );
      const jobId = activeJob?.id || await enqueueNazemSyncJob(connection, {
        operationType: 'account.discover_plans',
        entityType: 'account',
        entityId: teacherId,
        teacherId,
        payload: { studentExternalId, requestedFrom: 'nazem-issue-details' },
        idempotencyKey: `nazem:account:${teacherId}:student:${studentExternalId}:retry:${crypto.randomUUID()}`,
        maxAttempts: 3,
      });
      await connection.commit();
      return res.status(202).json({ jobId: Number(jobId), status: activeJob ? 'existing' : 'pending' });
    } catch (error) {
      await connection.rollback();
      return next(error);
    } finally {
      connection.release();
    }
  });

  router.post('/accounts/:teacherId/link', requireSettings, async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      const teacherId = Number(req.params.teacherId || 0);
      const username = String(req.body.username || '').trim();
      const password = String(req.body.password || '');
      if (!teacherId || !username || !password || username.length > 190 || password.length > 500) {
        throw invalid('بيانات حساب ناظم مطلوبة.');
      }
      const runtime = await getNazemRuntimeReadiness();
      if (!runtime.ready) {
        const error = new Error(runtime.issues.join(' '));
        error.statusCode = 503;
        throw error;
      }
      const teacher = await teacherExists(connection, teacherId);
      if (!teacher) {
        const error = new Error('المعلم غير موجود.');
        error.statusCode = 404;
        throw error;
      }
      await connection.beginTransaction();
      const [[activeJob]] = await connection.query(
        `SELECT id FROM nazem_sync_jobs
         WHERE teacher_id = ? AND status = 'syncing' AND lease_expires_at >= NOW(3)
         LIMIT 1 FOR UPDATE`,
        [teacherId],
      );
      if (activeJob) {
        const error = new Error('انتظر اكتمال مزامنة المعلم الحالية قبل تغيير بيانات حسابه.');
        error.statusCode = 409;
        throw error;
      }
      await connection.query(
        'SELECT id FROM nazem_accounts WHERE teacher_id = ? LIMIT 1 FOR UPDATE',
        [teacherId],
      );
      await connection.query(
        `INSERT INTO nazem_accounts
          (teacher_id, encrypted_username, encrypted_password, encrypted_session_state, status,
           last_error_code, last_error)
         VALUES (?, ?, ?, NULL, 'pending', NULL, NULL)
         ON DUPLICATE KEY UPDATE encrypted_username = VALUES(encrypted_username),
           encrypted_password = VALUES(encrypted_password), encrypted_session_state = NULL,
           identity_confirmed_at = NULL, identity_confirmed_by = NULL,
           identity_confirmed_fingerprint = NULL,
           status = 'pending', last_error_code = NULL, last_error = NULL`,
        [teacherId, encryptNazemSecret(username), encryptNazemSecret(password)],
      );
      const jobId = await enqueueAccountVerification(connection, teacherId);
      await connection.commit();
      res.status(202).json({ ok: true, jobId, status: 'pending' });
    } catch (error) {
      await connection.rollback();
      next(error);
    } finally {
      connection.release();
    }
  });

  router.post('/accounts/:teacherId/confirm-identity', requireSettings, async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      const teacherId = Number(req.params.teacherId || 0);
      const expectedTeacherName = String(req.body.externalTeacherName || '').trim();
      const expectedOrganizationName = String(req.body.externalOrganizationName || '').trim();
      await connection.beginTransaction();
      const [[account]] = await connection.query(
        `SELECT id, status, last_error_code AS lastErrorCode,
          external_teacher_name AS externalTeacherName,
          external_organization_name AS externalOrganizationName
         FROM nazem_accounts WHERE teacher_id = ? LIMIT 1 FOR UPDATE`,
        [teacherId],
      );
      if (!account) {
        const error = new Error('حساب المعلم غير مرتبط بناظم.');
        error.statusCode = 404;
        throw error;
      }
      const identityChanged = account.lastErrorCode === 'NAZEM_ACCOUNT_IDENTITY_CHANGED';
      if (account.status !== 'requires_review'
        || !['NAZEM_TEACHER_MISMATCH', 'NAZEM_ACCOUNT_IDENTITY_CHANGED'].includes(account.lastErrorCode)) {
        throw invalid('الحساب لا يحتاج اعتماد هوية حاليًا.');
      }
      if (!expectedTeacherName || expectedTeacherName !== String(account.externalTeacherName || '').trim()
        || expectedOrganizationName !== String(account.externalOrganizationName || '').trim()) {
        throw invalid('تغيرت هوية حساب ناظم المعروضة؛ أعد فتح نافذة الاعتماد.');
      }
      if (identityChanged) {
        await connection.query('DELETE FROM nazem_sync_jobs WHERE teacher_id = ?', [teacherId]);
        await connection.query('DELETE FROM nazem_sync_conflicts WHERE teacher_id = ?', [teacherId]);
        await connection.query('DELETE FROM nazem_recitation_links WHERE teacher_id = ?', [teacherId]);
        await connection.query('DELETE FROM nazem_plan_links WHERE teacher_id = ?', [teacherId]);
        await connection.query('DELETE FROM nazem_plan_candidates WHERE teacher_id = ?', [teacherId]);
        await connection.query('DELETE FROM nazem_student_links WHERE teacher_id = ?', [teacherId]);
        await connection.query('DELETE FROM nazem_student_candidates WHERE teacher_id = ?', [teacherId]);
      }
      await connection.query(
        `UPDATE nazem_accounts SET identity_confirmed_at = NOW(3), identity_confirmed_by = ?,
          identity_confirmed_fingerprint = ?,
          status = 'pending', last_error_code = NULL, last_error = NULL WHERE teacher_id = ?`,
        [
          Number(req.auth?.id || 0) || null,
          createNazemIdentityFingerprint(expectedTeacherName, expectedOrganizationName),
          teacherId,
        ],
      );
      const jobId = await enqueueAccountVerification(connection, teacherId, { identityConfirmed: true });
      await connection.commit();
      res.status(202).json({ ok: true, jobId, status: 'pending' });
    } catch (error) {
      await connection.rollback();
      next(error);
    } finally {
      connection.release();
    }
  });

  router.delete('/accounts/:teacherId', requireSettings, async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      const teacherId = Number(req.params.teacherId || 0);
      await connection.beginTransaction();
      const [[activeJob]] = await connection.query(
        `SELECT id FROM nazem_sync_jobs
         WHERE teacher_id = ? AND status = 'syncing' AND lease_expires_at >= NOW(3)
         LIMIT 1 FOR UPDATE`,
        [teacherId],
      );
      if (activeJob) {
        const error = new Error('انتظر اكتمال مزامنة المعلم الحالية قبل إلغاء الربط.');
        error.statusCode = 409;
        throw error;
      }
      await connection.query('DELETE FROM nazem_sync_jobs WHERE teacher_id = ?', [teacherId]);
      await connection.query('DELETE FROM nazem_sync_conflicts WHERE teacher_id = ?', [teacherId]);
      await connection.query('DELETE FROM nazem_recitation_links WHERE teacher_id = ?', [teacherId]);
      await connection.query('DELETE FROM nazem_plan_links WHERE teacher_id = ?', [teacherId]);
      await connection.query('DELETE FROM nazem_plan_candidates WHERE teacher_id = ?', [teacherId]);
      await connection.query('DELETE FROM nazem_student_links WHERE teacher_id = ?', [teacherId]);
      await connection.query('DELETE FROM nazem_student_candidates WHERE teacher_id = ?', [teacherId]);
      const [result] = await connection.query('DELETE FROM nazem_accounts WHERE teacher_id = ?', [teacherId]);
      await connection.commit();
      if (!result.affectedRows) return res.status(404).json({ message: 'حساب المعلم غير مرتبط بناظم.' });
      return res.json({ ok: true });
    } catch (error) {
      await connection.rollback();
      return next(error);
    } finally {
      connection.release();
    }
  });

  router.post('/accounts/:teacherId/refresh-import', requireSettings, async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      const teacherId = Number(req.params.teacherId || 0);
      const runtime = await getNazemRuntimeReadiness();
      if (!runtime.ready) {
        const error = new Error(runtime.issues.join(' '));
        error.statusCode = 503;
        throw error;
      }
      await connection.beginTransaction();
      const [[account]] = await connection.query(
        `SELECT account.teacher_id AS teacherId
         FROM nazem_accounts account
         JOIN supervisors teacher ON teacher.id = account.teacher_id AND teacher.role = 'supervisor'
         JOIN app_settings setting ON setting.setting_key = 'nazemIntegrationEnabled'
           AND setting.setting_value = 'true'
         WHERE account.teacher_id = ? AND account.status = 'connected' LIMIT 1 FOR UPDATE`,
        [teacherId],
      );
      if (!account) throw invalid('حساب المعلم غير متصل بناظم أو أن التكامل غير مفعل.');
      const [[activeJob]] = await connection.query(
        `SELECT id, status FROM nazem_sync_jobs
         WHERE teacher_id = ? AND operation_type = 'account.reconcile'
           AND (status IN ('pending','retrying')
             OR (status = 'syncing' AND lease_expires_at >= NOW(3)
               AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.requestedFrom')) = 'student-plan-import'))
         ORDER BY CASE WHEN status = 'syncing' THEN 0 ELSE 1 END,
           CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.requestedFrom')) = 'student-plan-import' THEN 0 ELSE 1 END,
           id DESC LIMIT 1 FOR UPDATE`,
        [teacherId],
      );
      if (activeJob) {
        await connection.query(
          `UPDATE nazem_sync_jobs SET payload_json = JSON_SET(
              COALESCE(payload_json, JSON_OBJECT()), '$.requestedFrom', 'student-plan-import'
            ), next_attempt_at = IF(status IN ('pending','retrying'), NOW(3), next_attempt_at)
           WHERE id = ?`,
          [activeJob.id],
        );
        await connection.query(
          `UPDATE nazem_sync_jobs SET status = 'dismissed', lease_owner = NULL,
            lease_expires_at = NULL, last_error_code = 'NAZEM_RECONCILE_DEDUPLICATED',
            last_error = 'تم دمج عملية المزامنة مع الطلب اليدوي الأحدث.'
           WHERE teacher_id = ? AND operation_type = 'account.reconcile'
             AND status IN ('pending','retrying') AND id <> ?`,
          [teacherId, activeJob.id],
        );
      }
      const jobId = activeJob?.id || await enqueueNazemSyncJob(connection, {
        operationType: 'account.reconcile',
        entityType: 'account',
        entityId: teacherId,
        teacherId,
        payload: { requestedFrom: 'student-plan-import' },
        idempotencyKey: `nazem:account:${teacherId}:refresh-import:${crypto.randomUUID()}`,
      });
      await connection.commit();
      return res.status(activeJob ? 200 : 202).json({
        jobId: Number(jobId),
        status: activeJob?.status || 'pending',
        reused: Boolean(activeJob),
      });
    } catch (error) {
      await connection.rollback();
      return next(error);
    } finally {
      connection.release();
    }
  });

  router.get('/accounts/:teacherId/refresh-import/:jobId', requireSettings, async (req, res, next) => {
    try {
      const teacherId = Number(req.params.teacherId || 0);
      const jobId = Number(req.params.jobId || 0);
      const [[job]] = await db().query(
        `SELECT id, status, attempt_count AS attemptCount, max_attempts AS maxAttempts,
          progress_percent AS progressPercent, progress_stage AS progressStage,
          last_error_code AS lastErrorCode, last_error AS lastError
         FROM nazem_sync_jobs
         WHERE id = ? AND teacher_id = ? AND operation_type = 'account.reconcile' LIMIT 1`,
        [jobId, teacherId],
      );
      if (!job) return res.status(404).json({ message: 'عملية تحديث بيانات ناظم غير موجودة.' });
      const [[event]] = job.status === 'synced' ? await db().query(
        `SELECT metadata_json AS resultJson
         FROM nazem_sync_events
         WHERE job_id = ? AND teacher_id = ? AND status = 'synced'
         ORDER BY id DESC LIMIT 1`,
        [jobId, teacherId],
      ) : [[]];
      return res.json({
        ...job,
        id: Number(job.id),
        attemptCount: Number(job.attemptCount || 0),
        maxAttempts: Number(job.maxAttempts || 0),
        progressPercent: Math.max(0, Math.min(100, Number(job.progressPercent || 0))),
        result: parseSnapshot(event?.resultJson),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/accounts/:teacherId/import-preview', requireSettings, async (req, res, next) => {
    try {
      const teacherId = Number(req.params.teacherId || 0);
      const committeeId = Number(req.query.committeeId || 0) || null;
      const [[account]] = await db().query(
        `SELECT account.teacher_id AS teacherId, teacher.name AS teacherName
         FROM nazem_accounts account
         JOIN supervisors teacher ON teacher.id = account.teacher_id AND teacher.role = 'supervisor'
         WHERE account.teacher_id = ? AND account.status = 'connected' LIMIT 1`,
        [teacherId],
      );
      if (!account) throw invalid('يجب ربط حساب المعلم بناظم قبل استيراد الطلاب.');
      const [committees] = await db().query(
        `SELECT committee.id, committee.name,
          EXISTS(SELECT 1 FROM supervisor_committees scope
            WHERE scope.supervisor_id = ? AND scope.committee_id = committee.id) AS assignedToTeacher,
          COUNT(student.id) AS studentCount
         FROM committees committee
         LEFT JOIN students student ON student.committee_id = committee.id
         GROUP BY committee.id, committee.name
         ORDER BY committee.name`,
        [teacherId],
      );
      const selectedCommittee = committeeId
        ? committees.find((committee) => Number(committee.id) === committeeId)
        : null;
      if (committeeId && !selectedCommittee) throw invalid('الحلقة المختارة غير موجودة.');
      const [localStudents] = committeeId ? await db().query(
        `SELECT student.id, student.name, student.login_number AS loginNumber,
          student.national_id AS nationalId, student.guardian_phone AS phone
         FROM students student
         WHERE student.committee_id = ? ORDER BY student.name`,
        [committeeId],
      ) : [[]];
      const [candidateRows] = await db().query(
        `SELECT candidate.id, candidate.nazem_student_id AS nazemStudentId,
          candidate.nazem_student_name AS nazemStudentName,
          candidate.external_organization_name AS organizationName,
          candidate.external_circle_name AS circleName,
          candidate.remote_snapshot AS remoteSnapshot,
          linked.ruwasi_student_id AS linkedStudentId,
          linkedStudent.name AS linkedStudentName,
          linkedStudent.committee_id AS linkedCommitteeId
         FROM nazem_student_candidates candidate
         LEFT JOIN nazem_student_links linked ON linked.teacher_id = candidate.teacher_id
           AND linked.nazem_student_id = candidate.nazem_student_id AND linked.status = 'linked'
         LEFT JOIN students linkedStudent ON linkedStudent.id = linked.ruwasi_student_id
         WHERE candidate.teacher_id = ? ORDER BY candidate.nazem_student_name`,
        [teacherId],
      );
      const candidates = candidateRows.filter((candidate) => isNazemExternalStudentId(candidate.nazemStudentId));
      const externalIds = [...new Set(candidates.map((candidate) => candidate.nazemStudentId))];
      let planRows = [];
      let linkedPlanRows = [];
      if (externalIds.length) {
        [planRows] = await db().query(
          `SELECT id, nazem_student_id AS nazemStudentId, nazem_plan_id AS nazemPlanId,
            remote_snapshot AS remoteSnapshot, progress_snapshot AS progressSnapshot,
            discovery_status AS status, last_error_code AS lastErrorCode, last_error AS lastError
           FROM nazem_plan_candidates
           WHERE teacher_id = ? AND nazem_student_id IN (${externalIds.map(() => '?').join(', ')})
             AND discovery_status <> 'stale'
           ORDER BY id`,
          [teacherId, ...externalIds],
        );
        [linkedPlanRows] = await db().query(
          `SELECT studentLink.nazem_student_id AS nazemStudentId,
            planLink.nazem_plan_id AS nazemPlanId,
            planLink.remote_snapshot AS remoteSnapshot,
            planLink.last_synced_snapshot AS lastSyncedSnapshot
           FROM nazem_student_links studentLink
           JOIN nazem_plan_links planLink ON planLink.teacher_id = studentLink.teacher_id
             AND planLink.ruwasi_student_id = studentLink.ruwasi_student_id
           WHERE studentLink.teacher_id = ? AND studentLink.status = 'linked'
             AND studentLink.nazem_student_id IN (${externalIds.map(() => '?').join(', ')})
             AND planLink.sync_status <> 'deleted'`,
          [teacherId, ...externalIds],
        );
      }
      const linkedPlansByStudent = new Map();
      linkedPlanRows.forEach((plan) => {
        const list = linkedPlansByStudent.get(plan.nazemStudentId) || [];
        list.push(plan);
        linkedPlansByStudent.set(plan.nazemStudentId, list);
      });
      const plansByStudent = new Map();
      planRows.forEach((plan) => {
        const list = plansByStudent.get(plan.nazemStudentId) || [];
        const remote = parseSnapshot(plan.remoteSnapshot);
        const linkedPlans = linkedPlansByStudent.get(plan.nazemStudentId) || [];
        const sameLinkedPlan = linkedPlans.find((linked) => String(linked.nazemPlanId) === String(plan.nazemPlanId));
        const synced = parseSnapshot(sameLinkedPlan?.lastSyncedSnapshot);
        const baseline = synced?.remote || parseSnapshot(sameLinkedPlan?.remoteSnapshot);
        const _resolveChangeType = () => {
          if (sameLinkedPlan) {
            if (baseline && !nazemPlanBundleMatches(remote, baseline)) {
              return 'changed';
            }
            return 'current';
          }
          if (linkedPlans.length) {
            return 'new';
          }
          return 'unlinked';
        };
        const changeType = _resolveChangeType();
        list.push({
          id: Number(plan.id),
          nazemPlanId: plan.nazemPlanId,
          status: plan.status,
          hasProgress: Boolean(parseSnapshot(plan.progressSnapshot)),
          track: remote?.primary?.tab || '',
          amount: remote?.primary?.amount || '',
          lastErrorCode: plan.lastErrorCode || '',
          lastError: plan.lastError || '',
          changeType,
        });
        plansByStudent.set(plan.nazemStudentId, list);
      });
      const exactMatchesByName = new Map();
      localStudents.forEach((student) => {
        const name = normalizeArabicPersonName(student.name);
        exactMatchesByName.set(name, [...(exactMatchesByName.get(name) || []), student]);
      });
      const recommendedCommittee = committees.find((committee) => candidates.some((candidate) => (
        normalizeArabicPersonName(committee.name) === normalizeArabicPersonName(candidate.circleName)
      ))) || null;
      res.json({
        teacher: account,
        committees: committees.map((committee) => ({
          ...committee,
          id: Number(committee.id),
          studentCount: Number(committee.studentCount || 0),
          assignedToTeacher: Boolean(committee.assignedToTeacher),
        })),
        selectedCommittee: selectedCommittee ? { id: Number(selectedCommittee.id), name: selectedCommittee.name } : null,
        recommendedCommitteeId: recommendedCommittee ? Number(recommendedCommittee.id) : null,
        suggestedNewCommitteeName: candidates[0]?.circleName || '',
        localStudents: localStudents.map((student) => ({
          id: Number(student.id),
          name: student.name,
          loginNumber: student.loginNumber,
        })),
        candidates: candidates.map((candidate) => {
          const profile = candidateContactProfile(candidate);
          const exact = exactMatchesByName.get(normalizeArabicPersonName(candidate.nazemStudentName)) || [];
          const identityMatch = localStudents.filter((student) => (
            (profile.nationalId && profile.nationalId === student.nationalId)
            || (profile.phone && profile.phone === student.phone)
          ));
          const closeNameMatch = findUniqueArabicPersonNameMatch(
            localStudents,
            candidate.nazemStudentName,
          )?.candidate || null;
          const _resolveSuggestedStudent = () => {
            if (identityMatch.length === 1) {
              return identityMatch[0];
            }
            if (exact.length === 1) {
              return exact[0];
            }
            return closeNameMatch;
          };
          const suggestedStudent = _resolveSuggestedStudent();
          const plans = plansByStudent.get(candidate.nazemStudentId) || [];
          return {
            ...candidate,
            profile,
            id: Number(candidate.id),
            linkedStudentId: Number(candidate.linkedStudentId || 0) || null,
            linkedCommitteeId: Number(candidate.linkedCommitteeId || 0) || null,
            suggestedStudentId: suggestedStudent ? Number(suggestedStudent.id) : null,
            plans,
            canAutoImportPlan: plans.length === 1
              && !['imported', 'linked', 'ignored'].includes(plans[0].status),
          };
        }),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/accounts/:teacherId/import', requireSettings, async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      if (typeof importPlanCandidate !== 'function') throw invalid('استيراد خطط ناظم غير متاح.');
      const teacherId = Number(req.params.teacherId || 0);
      const requestedCommitteeId = Number(req.body.committeeId || 0) || null;
      const newCommitteeName = cleanCommitteeName(req.body.newCommitteeName);
      const importMode = String(req.body.importMode || 'with_plans');
      const selections = Array.isArray(req.body.selections) ? req.body.selections : [];
      if (importMode !== 'with_plans') throw invalid('يسمح باستيراد الطلاب ذوي الخطط فقط؛ حدّث الصفحة.');
      if ((!requestedCommitteeId && !newCommitteeName) || (requestedCommitteeId && newCommitteeName)) {
        throw invalid('اختر حلقة موجودة أو اكتب اسم حلقة جديدة.');
      }
      if (!selections.length || selections.length > 200) throw invalid('اختر طالبًا واحدًا على الأقل للاستيراد.');
      const normalizedSelections = selections.map((selection) => ({
        candidateId: Number(selection.candidateId || 0),
        action: String(selection.action || ''),
        studentId: Number(selection.studentId || 0) || null,
        importPlan: selection.importPlan === true,
        planCandidateId: Number(selection.planCandidateId || 0) || null,
      }));
      if (normalizedSelections.some((selection) => (
        !selection.candidateId || !['create', 'match', 'keep'].includes(selection.action)
          || (selection.action === 'match' && !selection.studentId)
      ))) throw invalid('اختيارات استيراد الطلاب غير صحيحة.');
      const candidateIds = normalizedSelections.map((selection) => selection.candidateId);
      if (new Set(candidateIds).size !== candidateIds.length) throw invalid('لا يمكن تكرار الطالب نفسه في عملية الاستيراد.');

      await connection.beginTransaction();
      const [[account]] = await connection.query(
        `SELECT account.teacher_id AS teacherId
         FROM nazem_accounts account
         JOIN supervisors teacher ON teacher.id = account.teacher_id AND teacher.role = 'supervisor'
         WHERE account.teacher_id = ? AND account.status = 'connected' LIMIT 1 FOR UPDATE`,
        [teacherId],
      );
      if (!account) throw invalid('حساب المعلم غير متصل بناظم.');
      await assertNoActivePlanImportJob(connection, teacherId);

      let committee;
      let committeeCreated = false;
      if (requestedCommitteeId) {
        [[committee]] = await connection.query(
          'SELECT id, name FROM committees WHERE id = ? LIMIT 1 FOR UPDATE',
          [requestedCommitteeId],
        );
        if (!committee) throw invalid('الحلقة المختارة غير موجودة.');
      } else {
        if (newCommitteeName.length < 2) throw invalid('اسم الحلقة الجديدة قصير جدًا.');
        [[committee]] = await connection.query(
          'SELECT id, name FROM committees WHERE name = ? LIMIT 1 FOR UPDATE',
          [newCommitteeName],
        );
        if (!committee) {
          const [createdCommittee] = await connection.query('INSERT INTO committees (name) VALUES (?)', [newCommitteeName]);
          committee = { id: Number(createdCommittee.insertId), name: newCommitteeName };
          committeeCreated = true;
        }
      }
      committee.id = Number(committee.id);
      await connection.query(
        'INSERT IGNORE INTO supervisor_committees (supervisor_id, committee_id) VALUES (?, ?)',
        [teacherId, committee.id],
      );

      const [candidateRows] = await connection.query(
        `SELECT candidate.id, candidate.nazem_student_id AS nazemStudentId,
          candidate.nazem_student_name AS nazemStudentName,
          candidate.external_organization_id AS externalOrganizationId,
          candidate.external_organization_name AS externalOrganizationName,
          candidate.external_circle_id AS externalCircleId,
          candidate.external_circle_name AS externalCircleName,
          candidate.remote_snapshot AS remoteSnapshot,
          linked.ruwasi_student_id AS linkedStudentId
         FROM nazem_student_candidates candidate
         LEFT JOIN nazem_student_links linked ON linked.teacher_id = candidate.teacher_id
           AND linked.nazem_student_id = candidate.nazem_student_id AND linked.status = 'linked'
         WHERE candidate.teacher_id = ? AND candidate.id IN (${candidateIds.map(() => '?').join(', ')})
         FOR UPDATE`,
        [teacherId, ...candidateIds],
      );
      if (candidateRows.length !== candidateIds.length) throw invalid('بعض طلاب ناظم لم تعد متاحة؛ حدّث المعاينة.');
      const candidates = new Map(candidateRows.map((candidate) => [Number(candidate.id), candidate]));
      if (importMode === 'with_plans') {
        const [plannedCandidates] = await connection.query(
          `SELECT DISTINCT studentCandidate.id AS candidateId
           FROM nazem_student_candidates studentCandidate
           JOIN nazem_plan_candidates planCandidate
             ON planCandidate.teacher_id = studentCandidate.teacher_id
            AND planCandidate.nazem_student_id = studentCandidate.nazem_student_id
            AND planCandidate.discovery_status IN ('discovered', 'requires_review')
           WHERE studentCandidate.teacher_id = ?
             AND studentCandidate.id IN (${candidateIds.map(() => '?').join(', ')})`,
          [teacherId, ...candidateIds],
        );
        const plannedCandidateIds = new Set(plannedCandidates.map((row) => Number(row.candidateId)));
        if (normalizedSelections.some((selection) => (
          !plannedCandidateIds.has(selection.candidateId) || !selection.importPlan
        ))) {
          throw invalid('استيراد الطلاب ذوي الخطط يقبل فقط طالبًا لديه خطة ناظم قابلة للاستيراد.');
        }
      }
      const externalIds = candidateRows.map((candidate) => String(candidate.nazemStudentId || ''));
      if (externalIds.some((externalId) => !isNazemExternalStudentId(externalId))
        || new Set(externalIds).size !== externalIds.length) {
        throw invalid('معرّفات بعض طلاب ناظم غير ثابتة أو مكررة؛ أعد التحقق من الحساب.');
      }
      const usedLoginNumbers = await loadUsedLoginNumbers(connection);
      const summary = {
        created: 0,
        matched: 0,
        kept: 0,
        plansImported: 0,
        plansReview: 0,
        createdStudents: [],
        reviewItems: [],
      };
      const studentByExternalId = new Map();

      await importSelectedNazemStudents({ normalizedSelections, candidates, connection, summary, committee, usedLoginNumbers, teacherId, studentByExternalId });

      const importSelections = normalizedSelections.filter((selection) => (
        selection.importPlan && selection.action !== 'skip'
      ));
      for (const selection of importSelections) {
        const candidate = candidates.get(selection.candidateId);
        const studentId = studentByExternalId.get(candidate.nazemStudentId);
        const [planCandidates] = await connection.query(
          `SELECT id, teacher_id AS teacherId, ruwasi_student_id AS studentId,
            nazem_student_id AS nazemStudentId, nazem_plan_id AS nazemPlanId,
            remote_snapshot AS remoteSnapshot, progress_snapshot AS progressSnapshot,
            discovery_status AS status
           FROM nazem_plan_candidates
           WHERE teacher_id = ? AND nazem_student_id = ?
             AND discovery_status IN ('discovered','requires_review')
             AND (? IS NULL OR id = ?) FOR UPDATE`,
          [teacherId, candidate.nazemStudentId, selection.planCandidateId, selection.planCandidateId],
        );
        if (planCandidates.length !== 1 || !studentId) {
          summary.plansReview += 1;
          summary.reviewItems.push({ name: candidate.nazemStudentName, reason: 'الخطة تحتاج مراجعة يدوية.' });
          continue;
        }
        const planCandidate = planCandidates[0];
        const savepoint = `nazem_bulk_plan_${Number(planCandidate.id)}`;
        await connection.query(`SAVEPOINT ${savepoint}`);
        try {
          await importPlanCandidate(connection, {
            ...planCandidate,
            studentId,
            remoteSnapshot: parseSnapshot(planCandidate.remoteSnapshot),
            progressSnapshot: parseSnapshot(planCandidate.progressSnapshot),
          });
          await connection.query(
            `UPDATE nazem_plan_candidates SET discovery_status = 'imported',
              last_error_code = NULL, last_error = NULL, resolved_by_role = ?, resolved_by_id = ?,
              resolved_at = NOW(3) WHERE id = ?`,
            [String(req.auth?.role || 'manager'), Number(req.auth?.id || 0) || null, planCandidate.id],
          );
          await connection.query(`RELEASE SAVEPOINT ${savepoint}`);
          summary.plansImported += 1;
        } catch (error) {
          await connection.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          await connection.query(
            `UPDATE nazem_plan_candidates SET discovery_status = 'requires_review',
              last_error_code = ?, last_error = ? WHERE id = ?`,
            [String(error.code || 'NAZEM_BULK_IMPORT_REVIEW').slice(0, 80),
              String(error.message || 'تعذر استيراد الخطة.').slice(0, 500), planCandidate.id],
          );
          await connection.query(`RELEASE SAVEPOINT ${savepoint}`);
          summary.plansReview += 1;
          summary.reviewItems.push({ name: candidate.nazemStudentName, reason: error.message || 'تعذر استيراد الخطة.' });
        }
      }
      for (const studentId of new Set(studentByExternalId.values())) {
        await enqueueMissingNazemAttendance(connection, { teacherId, studentId });
      }
      await connection.commit();
      res.json({ ok: true, committee: { ...committee, created: committeeCreated }, ...summary });
    } catch (error) {
      await connection.rollback();
      next(error);
    } finally {
      connection.release();
    }
  });

  router.get('/accounts/:teacherId/students', requireSettings, async (req, res, next) => {
    try {
      const teacherId = Number(req.params.teacherId || 0);
      const [students] = await db().query(
        `SELECT DISTINCT student.id AS studentId, student.name AS studentName,
          link.nazem_student_id AS nazemStudentId, link.nazem_student_name AS nazemStudentName,
          link.status, link.match_confidence AS matchConfidence,
          DATE_FORMAT(link.last_verified_at, '%Y-%m-%d %H:%i') AS lastVerifiedAt
         FROM students student
         JOIN supervisor_committees scope ON scope.committee_id = student.committee_id AND scope.supervisor_id = ?
         LEFT JOIN nazem_student_links link ON link.teacher_id = ? AND link.ruwasi_student_id = student.id
         ORDER BY student.name`,
        [teacherId, teacherId],
      );
      const [candidates] = await db().query(
        `SELECT candidate.id, candidate.nazem_student_id AS nazemStudentId,
          candidate.nazem_student_name AS nazemStudentName,
          candidate.external_organization_name AS organizationName,
          candidate.external_circle_name AS circleName,
          linked.ruwasi_student_id AS linkedStudentId,
          DATE_FORMAT(candidate.last_seen_at, '%Y-%m-%d %H:%i') AS lastSeenAt
         FROM nazem_student_candidates candidate
         LEFT JOIN nazem_student_links linked ON linked.teacher_id = candidate.teacher_id
           AND linked.nazem_student_id = candidate.nazem_student_id AND linked.status = 'linked'
         WHERE candidate.teacher_id = ? ORDER BY candidate.nazem_student_name`,
        [teacherId],
      );
      res.json({
        students,
        candidates: candidates.filter((candidate) => isNazemExternalStudentId(candidate.nazemStudentId)),
      });
    } catch (error) {
      next(error);
    }
  });

  router.put('/accounts/:teacherId/students/:studentId', requireSettings, async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      const teacherId = Number(req.params.teacherId || 0);
      const studentId = Number(req.params.studentId || 0);
      const candidateId = Number(req.body.candidateId || 0);
      await connection.beginTransaction();
      const [[activeJob]] = await connection.query(
        `SELECT id FROM nazem_sync_jobs
         WHERE teacher_id = ? AND status = 'syncing' AND lease_expires_at >= NOW(3)
         LIMIT 1 FOR UPDATE`,
        [teacherId],
      );
      if (activeJob) {
        const error = new Error('انتظر اكتمال مزامنة المعلم الحالية قبل تغيير مطابقة الطلاب.');
        error.statusCode = 409;
        throw error;
      }
      const [[student]] = await connection.query(
        `SELECT student.id, student.name
         FROM students student
         JOIN supervisor_committees scope ON scope.committee_id = student.committee_id
         WHERE student.id = ? AND scope.supervisor_id = ? LIMIT 1 FOR UPDATE`,
        [studentId, teacherId],
      );
      const [[candidate]] = await connection.query(
        `SELECT nazem_student_id AS nazemStudentId, nazem_student_name AS nazemStudentName,
          external_organization_id AS externalOrganizationId,
          external_organization_name AS externalOrganizationName,
          external_circle_id AS externalCircleId, external_circle_name AS externalCircleName
         FROM nazem_student_candidates WHERE id = ? AND teacher_id = ? LIMIT 1 FOR UPDATE`,
        [candidateId, teacherId],
      );
      if (!student || !candidate) throw invalid('الطالب أو المطابقة المختارة غير صحيحة.');
      if (!isNazemExternalStudentId(candidate.nazemStudentId)) {
        throw invalid('لم يستطع ناظم تزويدنا بمعرف ثابت لهذا الطالب؛ أعد التحقق من الحساب.');
      }
      const [[usedCandidate]] = await connection.query(
        `SELECT ruwasi_student_id AS studentId FROM nazem_student_links
         WHERE teacher_id = ? AND nazem_student_id = ? AND status = 'linked'
           AND ruwasi_student_id <> ? LIMIT 1 FOR UPDATE`,
        [teacherId, candidate.nazemStudentId, studentId],
      );
      if (usedCandidate) throw invalid('طالب ناظم المحدد مرتبط بطالب آخر بالفعل.');
      await connection.query(
        `INSERT INTO nazem_student_links
          (teacher_id, ruwasi_student_id, nazem_student_id, nazem_student_name,
           external_organization_id, external_organization_name, external_circle_id,
           external_circle_name, match_confidence, status, last_verified_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'linked', NOW(3))
         ON DUPLICATE KEY UPDATE nazem_student_id = VALUES(nazem_student_id),
           nazem_student_name = VALUES(nazem_student_name),
           external_organization_id = VALUES(external_organization_id),
           external_organization_name = VALUES(external_organization_name),
           external_circle_id = VALUES(external_circle_id), external_circle_name = VALUES(external_circle_name),
           match_confidence = VALUES(match_confidence), status = 'linked', last_verified_at = NOW(3)`,
        [
          teacherId,
          studentId,
          candidate.nazemStudentId,
          candidate.nazemStudentName,
          candidate.externalOrganizationId,
          candidate.externalOrganizationName,
          candidate.externalCircleId,
          candidate.externalCircleName,
          calculateNameMatchConfidence(student.name, candidate.nazemStudentName),
        ],
      );
      await connection.query(
        `UPDATE nazem_plan_candidates SET ruwasi_student_id = ?,
          discovery_status = IF(discovery_status IN ('linked','imported','ignored'), discovery_status, 'discovered'),
          last_error_code = NULL, last_error = NULL
         WHERE teacher_id = ? AND nazem_student_id = ?`,
        [studentId, teacherId, candidate.nazemStudentId],
      );
      const jobId = await enqueueAccountVerification(connection, teacherId, {
        discoverPlansAfterStudentMatch: true,
      });
      await connection.commit();
      res.json({ ok: true, jobId });
    } catch (error) {
      await connection.rollback();
      next(error);
    } finally {
      connection.release();
    }
  });

  router.get('/accounts/:teacherId/plans', requireSettings, async (req, res, next) => {
    try {
      const teacherId = Number(req.params.teacherId || 0);
      const [plans] = await db().query(
        `SELECT candidate.id, candidate.ruwasi_student_id AS studentId,
          student.name AS studentName, candidate.nazem_student_id AS nazemStudentId,
          candidate.nazem_student_name AS nazemStudentName,
          candidate.nazem_plan_id AS nazemPlanId,
          candidate.remote_snapshot AS remoteSnapshot,
          candidate.progress_snapshot AS progressSnapshot,
          candidate.discovery_status AS status,
          candidate.last_error_code AS lastErrorCode, candidate.last_error AS lastError,
          DATE_FORMAT(candidate.last_seen_at, '%Y-%m-%d %H:%i') AS lastSeenAt,
          localPlan.id AS localPlanId, localPlan.track AS localTrack,
          localPlan.start_surah AS localStartSurah, localPlan.start_ayah AS localStartAyah,
          localPlan.end_surah AS localEndSurah, localPlan.end_ayah AS localEndAyah,
          localPlan.daily_pages AS localDailyPages
         FROM nazem_plan_candidates candidate
         LEFT JOIN students student ON student.id = candidate.ruwasi_student_id
         LEFT JOIN student_quran_plans localPlan
           ON localPlan.student_id = candidate.ruwasi_student_id AND localPlan.status = 'active'
         WHERE candidate.teacher_id = ? AND candidate.discovery_status <> 'stale'
         ORDER BY candidate.nazem_student_name, candidate.nazem_plan_id`,
        [teacherId],
      );
      res.json(plans);
    } catch (error) {
      next(error);
    }
  });

  router.post('/plans/import-ready', requirePlanStatusAccess, async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      await connection.beginTransaction();
      const { imported, review } = await importReadyNazemPlans(connection, {
        teacherId: req.auth?.role === 'supervisor' ? Number(req.auth.id) : null,
        actor: req.auth,
        importPlanCandidate,
      });
      await connection.commit();
      return res.json({ ok: true, imported, review });
    } catch (error) {
      await connection.rollback();
      return next(error);
    } finally {
      connection.release();
    }
  });

  router.post('/accounts/:teacherId/plans/:candidateId/import', requireSettings, async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      if (typeof importPlanCandidate !== 'function') throw invalid('استيراد خطط ناظم غير متاح.');
      const teacherId = Number(req.params.teacherId || 0);
      const candidateId = Number(req.params.candidateId || 0);
      await connection.beginTransaction();
      await assertNoActivePlanImportJob(connection, teacherId);
      const { result } = await importDiscoveredPlan(connection, {
        teacherId,
        candidateId,
        actor: req.auth,
      });
      await connection.commit();
      res.json({ ok: true, ...result });
    } catch (error) {
      await connection.rollback();
      next(error);
    } finally {
      connection.release();
    }
  });

  router.post('/accounts/:teacherId/plans/import-bulk', requireSettings, async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      if (typeof importPlanCandidate !== 'function') throw invalid('استيراد خطط ناظم غير متاح.');
      const teacherId = Number(req.params.teacherId || 0);
      const candidateIds = [...new Set(
        (Array.isArray(req.body.candidateIds) ? req.body.candidateIds : [])
          .map(Number)
          .filter((id) => Number.isSafeInteger(id) && id > 0),
      )];
      if (!candidateIds.length || candidateIds.length > 200) {
        throw invalid('اختر خطة واحدة على الأقل، وبحد أقصى 200 خطة.');
      }
      await connection.beginTransaction();
      await assertNoActivePlanImportJob(connection, teacherId);
      const summary = { imported: [], review: [] };
      for (const candidateId of candidateIds) {
        const savepoint = `nazem_plan_bulk_${candidateId}`;
        await connection.query(`SAVEPOINT ${savepoint}`);
        try {
          const { candidate } = await importDiscoveredPlan(connection, {
            teacherId,
            candidateId,
            actor: req.auth,
          });
          await connection.query(`RELEASE SAVEPOINT ${savepoint}`);
          summary.imported.push({ candidateId, studentId: Number(candidate.studentId) });
        } catch (error) {
          await connection.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          await connection.query(
            `UPDATE nazem_plan_candidates SET discovery_status = 'requires_review',
              last_error_code = 'NAZEM_BULK_IMPORT_REVIEW', last_error = ?
             WHERE id = ? AND teacher_id = ?
               AND discovery_status IN ('discovered','requires_review')`,
            [String(error.message || 'تعذر استيراد الخطة.').slice(0, 500), candidateId, teacherId],
          );
          await connection.query(`RELEASE SAVEPOINT ${savepoint}`);
          summary.review.push({ candidateId, message: error.message || 'تعذر استيراد الخطة.' });
        }
      }
      await connection.commit();
      res.json({ ok: true, ...summary });
    } catch (error) {
      await connection.rollback();
      next(error);
    } finally {
      connection.release();
    }
  });

  router.post('/accounts/:teacherId/plans/:candidateId/ignore', requireSettings, async (req, res, next) => {
    try {
      const teacherId = Number(req.params.teacherId || 0);
      const candidateId = Number(req.params.candidateId || 0);
      const [result] = await db().query(
        `UPDATE nazem_plan_candidates SET discovery_status = 'ignored',
          last_error_code = NULL, last_error = NULL, resolved_by_role = ?, resolved_by_id = ?,
          resolved_at = NOW(3) WHERE id = ? AND teacher_id = ?
          AND discovery_status IN ('discovered','requires_review')`,
        [String(req.auth?.role || 'manager'), Number(req.auth?.id || 0) || null, candidateId, teacherId],
      );
      if (!result.affectedRows) return res.status(404).json({ message: 'الخطة المكتشفة غير موجودة أو حُسمت سابقًا.' });
      return res.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/jobs', requireSettings, async (req, res, next) => {
    try {
      const status = String(req.query.status || '').trim();
      const params = [];
      const filters = [];
      if (status) {
        filters.push('job.status = ?');
        params.push(status);
      }
      const [rows] = await db().query(
        `SELECT job.id, job.sync_uuid AS syncUuid, job.operation_type AS operationType,
          job.entity_type AS entityType, job.entity_id AS entityId, job.status,
          job.attempt_count AS attemptCount, job.max_attempts AS maxAttempts,
          job.last_error_code AS lastErrorCode, job.last_error AS lastError,
          DATE_FORMAT(job.created_at, '%Y-%m-%d %H:%i') AS createdAt,
          DATE_FORMAT(job.last_succeeded_at, '%Y-%m-%d %H:%i') AS lastSucceededAt,
          teacher.name AS teacherName, student.name AS studentName
         FROM nazem_sync_jobs job
         JOIN supervisors teacher ON teacher.id = job.teacher_id
         LEFT JOIN students student ON student.id = job.student_id
         ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
         ORDER BY job.created_at DESC LIMIT 250`,
        params,
      );
      res.json(rows.map((row) => ({
        ...row,
        attemptCount: Number(row.attemptCount || 0),
        maxAttempts: Number(row.maxAttempts || 0),
      })));
    } catch (error) {
      next(error);
    }
  });

  router.get('/log', requireSettings, async (_req, res, next) => {
    try {
      const [eventRows] = await db().query(
        `SELECT event.id, event.job_id AS jobId, 'history' AS entryKind,
          event.operation_type AS operationType,
          JSON_UNQUOTE(JSON_EXTRACT(job.payload_json, '$.taskType')) AS taskType,
          JSON_UNQUOTE(JSON_EXTRACT(job.payload_json, '$.track')) AS track,
          JSON_UNQUOTE(JSON_EXTRACT(job.payload_json, '$.taskDate')) AS taskDate,
          event.status, event.attempt_number AS attemptNumber,
          JSON_UNQUOTE(JSON_EXTRACT(event.metadata_json, '$.alreadyRecorded')) AS alreadyRecorded,
          JSON_UNQUOTE(JSON_EXTRACT(event.metadata_json, '$.authoritative')) AS authoritative,
          event.error_code AS errorCode, event.message,
          DATE_FORMAT(event.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
          teacher.name AS teacherName, student.name AS studentName
         FROM nazem_sync_events event
         LEFT JOIN nazem_sync_jobs job ON job.id = event.job_id
         JOIN supervisors teacher ON teacher.id = event.teacher_id
         LEFT JOIN students student ON student.id = event.student_id
         ORDER BY event.created_at DESC LIMIT 500`,
      );
      const [activeRows] = await db().query(
        `SELECT CONCAT('job-', job.id) AS id, job.id AS jobId, 'current' AS entryKind,
          job.operation_type AS operationType, job.status,
          JSON_UNQUOTE(JSON_EXTRACT(job.payload_json, '$.taskType')) AS taskType,
          JSON_UNQUOTE(JSON_EXTRACT(job.payload_json, '$.track')) AS track,
          JSON_UNQUOTE(JSON_EXTRACT(job.payload_json, '$.taskDate')) AS taskDate,
          job.attempt_count AS attemptNumber, job.last_error_code AS errorCode,
          job.last_error AS message,
          (SELECT JSON_UNQUOTE(JSON_EXTRACT(latest.metadata_json, '$.alreadyRecorded'))
             FROM nazem_sync_events latest WHERE latest.job_id = job.id AND latest.status = 'synced'
             ORDER BY latest.id DESC LIMIT 1) AS alreadyRecorded,
          (SELECT JSON_UNQUOTE(JSON_EXTRACT(latest.metadata_json, '$.authoritative'))
             FROM nazem_sync_events latest WHERE latest.job_id = job.id AND latest.status = 'synced'
             ORDER BY latest.id DESC LIMIT 1) AS authoritative,
          DATE_FORMAT(COALESCE(job.last_succeeded_at, job.updated_at), '%Y-%m-%d %H:%i:%s') AS createdAt,
          teacher.name AS teacherName, student.name AS studentName
         FROM nazem_sync_jobs job
         JOIN supervisors teacher ON teacher.id = job.teacher_id
         LEFT JOIN students student ON student.id = job.student_id
         WHERE job.status IN ('pending','syncing','retrying','blocked','failed','requires_review','conflict','synced')
         ORDER BY CASE job.status
           WHEN 'conflict' THEN 0 WHEN 'requires_review' THEN 1 WHEN 'failed' THEN 2
           WHEN 'retrying' THEN 3 WHEN 'syncing' THEN 4 WHEN 'pending' THEN 5
           WHEN 'blocked' THEN 6 WHEN 'synced' THEN 7 ELSE 8 END,
           CASE WHEN job.operation_type IN ('attendance.submit','recitation.submit') THEN 0 ELSE 1 END,
           job.updated_at DESC LIMIT 500`,
      );
      return res.json(buildNazemLogEntries(activeRows, eventRows));
    } catch (error) {
      return next(error);
    }
  });

  router.post('/jobs/:jobId/retry', requireSettings, async (req, res, next) => {
    try {
      const [[job]] = await db().query(
        `SELECT job.id, job.operation_type AS operationType,
          CASE WHEN job.operation_type = 'plan.upsert' AND plan.start_date > CURDATE()
            THEN TIMESTAMP(plan.start_date, '00:05:00') ELSE NOW(3) END AS nextAttemptAt
         FROM nazem_sync_jobs job
         LEFT JOIN student_quran_plans plan ON job.entity_type = 'plan' AND plan.id = job.entity_id
         WHERE job.id = ? LIMIT 1`,
        [req.params.jobId],
      );
      if (!job) return res.status(404).json({ message: 'عملية المزامنة غير موجودة.' });
      const [result] = await db().query(
        `UPDATE nazem_sync_jobs SET status = 'pending', next_attempt_at = ?, max_attempts = GREATEST(max_attempts, attempt_count + 2),
          lease_owner = NULL, lease_expires_at = NULL, last_heartbeat_at = NULL,
          progress_stage = 'retry-requested'
         WHERE id = ? AND status IN ('failed','blocked','requires_review','conflict')`,
        [job.nextAttemptAt, req.params.jobId],
      );
      if (!result.affectedRows) return res.status(409).json({ message: 'العملية غير قابلة لإعادة المحاولة حاليًا.' });
      return res.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/jobs/:jobId/dismiss', requireSettings, async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      await connection.beginTransaction();
      const [[job]] = await connection.query(
        `SELECT id, entity_id AS entityId, teacher_id AS teacherId
         FROM nazem_sync_jobs
         WHERE id = ? AND operation_type = 'plan.delete'
           AND status IN ('failed','blocked','requires_review')
         LIMIT 1 FOR UPDATE`,
        [req.params.jobId],
      );
      if (!job) {
        const error = new Error('عملية حذف الخطة غير قابلة للإغلاق حاليًا.');
        error.statusCode = 409;
        throw error;
      }
      await connection.query(
        `UPDATE nazem_sync_jobs SET status = 'dismissed', lease_owner = NULL, lease_expires_at = NULL,
          last_error_code = 'NAZEM_EXTERNAL_RETAINED',
          last_error = 'أُبقيت خطة ناظم وأُغلق الربط بها يدويًا.' WHERE id = ?`,
        [job.id],
      );
      await connection.query(
        `UPDATE nazem_plan_links SET sync_status = 'detached',
          last_error_code = 'NAZEM_EXTERNAL_RETAINED',
          last_error = 'أُبقيت خطة ناظم وأُغلق الربط بها يدويًا.'
         WHERE ruwasi_plan_id = ? AND teacher_id = ?`,
        [job.entityId, job.teacherId],
      );
      await connection.commit();
      res.json({ ok: true });
    } catch (error) {
      await connection.rollback();
      next(error);
    } finally {
      connection.release();
    }
  });

  router.get('/conflicts', requireSettings, async (_req, res, next) => {
    try {
      const requestedTeacherId = String(_req.query.teacherId || '').trim();
      const teacherId = requestedTeacherId ? Number(requestedTeacherId) : null;
      if (requestedTeacherId && (!Number.isSafeInteger(teacherId) || teacherId <= 0)) {
        throw invalid('معرّف المعلم غير صحيح.');
      }
      const [rows] = await db().query(
        `SELECT conflict.id, conflict.entity_type AS entityType, conflict.entity_id AS entityId,
          conflict.teacher_id AS teacherId,
          conflict.local_snapshot AS localSnapshot, conflict.remote_snapshot AS remoteSnapshot,
          conflict.base_snapshot AS baseSnapshot, conflict.status, conflict.resolution,
          DATE_FORMAT(conflict.created_at, '%Y-%m-%d %H:%i') AS createdAt,
          teacher.name AS teacherName, student.id AS studentId, student.name AS studentName
         FROM nazem_sync_conflicts conflict
         JOIN supervisors teacher ON teacher.id = conflict.teacher_id
         LEFT JOIN student_quran_plans plan ON conflict.entity_type = 'plan' AND plan.id = conflict.entity_id
         LEFT JOIN nazem_recitation_links recitationLink
           ON conflict.entity_type = 'recitation' AND recitationLink.ruwasi_recitation_id = conflict.entity_id
         LEFT JOIN student_quran_tasks recitationTask ON recitationTask.id = recitationLink.ruwasi_task_id
         LEFT JOIN nazem_daily_follow_up_links dailyLink
           ON conflict.entity_type = 'recitation_day' AND dailyLink.id = conflict.entity_id
         LEFT JOIN students student ON student.id = COALESCE(plan.student_id, recitationTask.student_id, dailyLink.ruwasi_student_id)
         WHERE conflict.status = 'open'
           ${teacherId ? 'AND conflict.teacher_id = ?' : ''}
         ORDER BY conflict.created_at DESC`,
        teacherId ? [teacherId] : [],
      );
      res.json(rows);
    } catch (error) {
      next(error);
    }
  });

  router.post('/conflicts/:conflictId/resolve', requireSettings, async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      const resolution = String(req.body.resolution || '');
      if (!['use_ruwasi', 'use_nazem', 'ignore_remote'].includes(resolution)) {
        throw invalid('حل التعارض غير مدعوم.');
      }
      await connection.beginTransaction();
      const [[conflict]] = await connection.query(
        `SELECT conflict.id, conflict.entity_type AS entityType, conflict.entity_id AS entityId,
          conflict.teacher_id AS teacherId,
          conflict.local_snapshot AS localSnapshot, conflict.remote_snapshot AS remoteSnapshot,
          COALESCE(plan.student_id, recitationTask.student_id, dailyLink.ruwasi_student_id) AS studentId,
          COALESCE(plan.id, recitationTask.plan_id, dailyLink.ruwasi_plan_id) AS planId,
          planLink.nazem_student_id AS nazemStudentId, planLink.nazem_plan_id AS nazemPlanId
         FROM nazem_sync_conflicts conflict
         LEFT JOIN student_quran_plans plan ON conflict.entity_type = 'plan' AND plan.id = conflict.entity_id
         LEFT JOIN nazem_plan_links planLink
           ON conflict.entity_type = 'plan' AND planLink.ruwasi_plan_id = conflict.entity_id
          AND planLink.teacher_id = conflict.teacher_id
         LEFT JOIN nazem_recitation_links recitationLink
           ON conflict.entity_type = 'recitation' AND recitationLink.ruwasi_recitation_id = conflict.entity_id
         LEFT JOIN student_quran_tasks recitationTask ON recitationTask.id = recitationLink.ruwasi_task_id
         LEFT JOIN nazem_daily_follow_up_links dailyLink
           ON conflict.entity_type = 'recitation_day' AND dailyLink.id = conflict.entity_id
         WHERE conflict.id = ? AND conflict.status = 'open' LIMIT 1 FOR UPDATE`,
        [req.params.conflictId],
      );
      if (!conflict) {
        const error = new Error('التعارض غير موجود أو سبق حله.');
        error.statusCode = 404;
        throw error;
      }
      let importedPlan = null;
      if (resolution === 'use_ruwasi' && conflict.entityType === 'plan') {
        await queueLocalPlanConflict(connection, conflict);
      } else if (resolution === 'use_ruwasi' && conflict.entityType === 'recitation') {
        await queueLocalRecitationConflict(connection, conflict);
      } else if (resolution === 'use_ruwasi' && conflict.entityType === 'recitation_day') {
        await queueLocalDailyConflict(connection, conflict);
      } else if (resolution === 'use_nazem' && conflict.entityType === 'plan') {
        importedPlan = await acceptNazemPlanConflict(importPlanCandidate, connection, conflict, importedPlan, req);
      } else if (resolution === 'use_nazem' && conflict.entityType === 'recitation_day') {
        await acceptNazemDailyConflict(conflict, connection);
      } else if (resolution === 'use_nazem') {
        throw invalid('اعتماد نسخة ناظم متاح لتعارضات الخطط فقط.');
      } else if (conflict.entityType === 'plan') {
        await connection.query(
          `UPDATE nazem_plan_links SET sync_status = 'synced',
            last_synced_snapshot = ?, remote_snapshot = ?, last_synced_at = NOW(3),
            last_remote_checked_at = NOW(3),
            last_error_code = NULL, last_error = NULL
           WHERE ruwasi_plan_id = ? AND teacher_id = ?`,
          [
            JSON.stringify({
              local: typeof conflict.localSnapshot === 'string'
                ? JSON.parse(conflict.localSnapshot) : conflict.localSnapshot,
              remote: typeof conflict.remoteSnapshot === 'string'
                ? JSON.parse(conflict.remoteSnapshot) : conflict.remoteSnapshot,
            }),
            typeof conflict.remoteSnapshot === 'string'
              ? conflict.remoteSnapshot : JSON.stringify(conflict.remoteSnapshot || {}),
            conflict.entityId,
            conflict.teacherId,
          ],
        );
      } else if (conflict.entityType === 'recitation') {
        await connection.query(
          `UPDATE nazem_recitation_links SET sync_status = 'synced', remote_snapshot = ?,
            last_synced_at = NOW(3),
            last_error_code = NULL, last_error = NULL
           WHERE ruwasi_recitation_id = ? AND teacher_id = ?`,
          [
            typeof conflict.remoteSnapshot === 'string'
              ? conflict.remoteSnapshot : JSON.stringify(conflict.remoteSnapshot || {}),
            conflict.entityId,
            conflict.teacherId,
          ],
        );
      } else if (conflict.entityType === 'recitation_day') {
        await connection.query(
          `UPDATE nazem_daily_follow_up_links SET sync_status = 'conflict', remote_snapshot = ?,
            last_remote_checked_at = NOW(3), last_error_code = 'NAZEM_DIFFERENCE_ACCEPTED',
            last_error = 'اعتمد المسؤول استمرار الاختلاف بين المنصة وناظم.'
           WHERE id = ? AND teacher_id = ?`,
          [JSON.stringify(parseSnapshot(conflict.remoteSnapshot) || {}), conflict.entityId, conflict.teacherId],
        );
      }
      await connection.query(
        `UPDATE nazem_sync_conflicts SET status = 'resolved', resolution = ?,
          resolved_by_role = ?, resolved_by_id = ?, resolved_at = NOW(3) WHERE id = ?`,
        [resolution, req.auth?.role || 'manager', Number(req.auth?.id || 0) || null, conflict.id],
      );
      if (resolution === 'use_nazem') {
        await connection.query(
          `UPDATE nazem_sync_jobs SET status = 'dismissed', last_error_code = NULL,
            last_error = NULL, lease_owner = NULL, lease_expires_at = NULL,
            last_heartbeat_at = NULL
           WHERE entity_type = ? AND entity_id = ? AND teacher_id = ? AND status = 'conflict'`,
          [conflict.entityType, conflict.entityId, conflict.teacherId],
        );
      }
      await connection.commit();
      res.json({ ok: true, ...(importedPlan ? { planId: importedPlan.planId } : {}) });
    } catch (error) {
      await connection.rollback();
      next(error);
    } finally {
      connection.release();
    }
  });

  router.get('/plan-statuses', requirePlanStatusAccess, async (req, res, next) => {
    try {
      const studentId = Number(req.query.studentId || 0);
      const params = [];
      const filters = [];
      if (studentId) {
        filters.push('plan.student_id = ?');
        params.push(studentId);
      }
      if (req.auth?.role === 'supervisor') {
        filters.push(`EXISTS (
          SELECT 1 FROM supervisor_committees scope
          JOIN students scopedStudent ON scopedStudent.committee_id = scope.committee_id
          WHERE scope.supervisor_id = ? AND scopedStudent.id = plan.student_id
        )`);
        params.push(req.auth.id);
      }
      const [rows] = await db().query(
        `SELECT plan.id AS planId, link.sync_status AS status,
          link.last_error_code AS lastErrorCode, link.last_error AS lastError,
          DATE_FORMAT(link.last_synced_at, '%Y-%m-%d %H:%i') AS lastSyncedAt
         FROM student_quran_plans plan
         LEFT JOIN nazem_plan_links link ON link.ruwasi_plan_id = plan.id
         ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
         ORDER BY plan.id DESC LIMIT 500`,
        params,
      );
      res.json(rows);
    } catch (error) {
      next(error);
    }
  });

  router.get('/daily-statuses', requirePlanStatusAccess, async (req, res, next) => {
    try {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || ''))
        ? String(req.query.date)
        : null;
      const filters = [];
      const params = [];
      if (date) {
        filters.push('daily.follow_up_date = ?');
        params.push(date);
      }
      if (req.auth?.role === 'supervisor') {
        filters.push('daily.teacher_id = ?');
        params.push(Number(req.auth.id));
      }
      const [rows] = await db().query(
        `SELECT daily.id, daily.ruwasi_student_id AS studentId,
          DATE_FORMAT(daily.follow_up_date, '%Y-%m-%d') AS date,
          daily.task_type AS taskType, daily.sync_status AS status,
          daily.last_error_code AS lastErrorCode, daily.last_error AS lastError,
          DATE_FORMAT(daily.last_synced_at, '%Y-%m-%d %H:%i') AS lastSyncedAt,
          student.name AS studentName
         FROM nazem_daily_follow_up_links daily
         JOIN students student ON student.id = daily.ruwasi_student_id
         ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
         ORDER BY daily.follow_up_date DESC, daily.updated_at DESC LIMIT 250`,
        params,
      );
      const attendanceFilters = ["job.operation_type = 'attendance.submit'"];
      const attendanceParams = [];
      if (date) {
        attendanceFilters.push("JSON_UNQUOTE(JSON_EXTRACT(job.payload_json, '$.date')) = ?");
        attendanceParams.push(date);
      }
      if (req.auth?.role === 'supervisor') {
        attendanceFilters.push('job.teacher_id = ?');
        attendanceParams.push(Number(req.auth.id));
      }
      const [attendanceRows] = await db().query(
        `SELECT job.id, job.student_id AS studentId,
          JSON_UNQUOTE(JSON_EXTRACT(job.payload_json, '$.date')) AS date,
          'attendance' AS taskType, job.status,
          job.last_error_code AS lastErrorCode, job.last_error AS lastError,
          DATE_FORMAT(job.last_succeeded_at, '%Y-%m-%d %H:%i') AS lastSyncedAt,
          student.name AS studentName
         FROM nazem_sync_jobs job
         LEFT JOIN students student ON student.id = job.student_id
         WHERE ${attendanceFilters.join(' AND ')}
           AND NOT EXISTS (
             SELECT 1 FROM nazem_sync_jobs newer
             WHERE newer.operation_type = 'attendance.submit'
               AND newer.teacher_id = job.teacher_id
               AND newer.student_id = job.student_id
               AND JSON_UNQUOTE(JSON_EXTRACT(newer.payload_json, '$.date')) =
                 JSON_UNQUOTE(JSON_EXTRACT(job.payload_json, '$.date'))
               AND newer.id > job.id
           )
         ORDER BY job.created_at DESC LIMIT 250`,
        attendanceParams,
      );
      res.json([...rows, ...attendanceRows]);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

/** Create or match each explicitly selected student and preserve link identity within the import transaction. */
async function importSelectedNazemStudents({ normalizedSelections, candidates, connection, summary, committee, usedLoginNumbers, teacherId, studentByExternalId }) {
  for (const selection of normalizedSelections) {
    const candidate = candidates.get(selection.candidateId);
    const profile = candidateContactProfile(candidate);
    let student;
    if (selection.action === 'keep') {
      if (!candidate.linkedStudentId) throw invalid(`الطالب ${candidate.nazemStudentName} غير مرتبط بعد.`);
      [[student]] = await connection.query(
        'SELECT id, name, committee_id AS committeeId FROM students WHERE id = ? LIMIT 1 FOR UPDATE',
        [candidate.linkedStudentId]
      );
      summary.kept += 1;
    } else if (selection.action === 'match') {
      [[student]] = await connection.query(
        `SELECT id, name, committee_id AS committeeId FROM students
             WHERE id = ? AND committee_id = ? LIMIT 1 FOR UPDATE`,
        [selection.studentId, committee.id]
      );
      if (!student) throw invalid(`طالب مدارج المختار لـ ${candidate.nazemStudentName} غير موجود في الحلقة.`);
      summary.matched += 1;
    } else {
      const loginNumber = generateThreeDigitLoginNumber(usedLoginNumbers);
      if (!loginNumber) throw invalid('لا توجد أرقام دخول ثلاثية متاحة لإنشاء الطلاب.');
      const [created] = await connection.query(
        `INSERT INTO students (name, login_number, national_id, guardian_phone, committee_id)
             VALUES (?, ?, ?, ?, ?)`,
        [candidate.nazemStudentName, loginNumber, profile.nationalId, profile.phone, committee.id]
      );
      student = { id: Number(created.insertId), name: candidate.nazemStudentName, committeeId: committee.id };
      summary.created += 1;
      summary.createdStudents.push({ id: student.id, name: student.name, loginNumber });
    }
    if (!student) throw invalid(`تعذر تجهيز الطالب ${candidate.nazemStudentName}.`);
    await connection.query(
      `UPDATE students SET
            national_id = IF(national_id = '', ?, national_id),
            guardian_phone = IF(guardian_phone = '', ?, guardian_phone)
           WHERE id = ?`,
      [profile.nationalId, profile.phone, student.id]
    );
    const [[externalOwner]] = await connection.query(
      `SELECT ruwasi_student_id AS studentId FROM nazem_student_links
           WHERE teacher_id = ? AND nazem_student_id = ? AND status = 'linked'
             AND ruwasi_student_id <> ? LIMIT 1 FOR UPDATE`,
      [teacherId, candidate.nazemStudentId, student.id]
    );
    const [[localOwner]] = await connection.query(
      `SELECT nazem_student_id AS nazemStudentId FROM nazem_student_links
           WHERE teacher_id = ? AND ruwasi_student_id = ? AND status = 'linked'
             AND nazem_student_id <> ? LIMIT 1 FOR UPDATE`,
      [teacherId, student.id, candidate.nazemStudentId]
    );
    if (externalOwner || localOwner) throw invalid(`يوجد ربط سابق متعارض للطالب ${candidate.nazemStudentName}.`);
    await connection.query(
      `INSERT INTO nazem_student_links
            (teacher_id, ruwasi_student_id, nazem_student_id, nazem_student_name,
             external_organization_id, external_organization_name, external_circle_id,
             external_circle_name, match_confidence, status, last_verified_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'linked', NOW(3))
           ON DUPLICATE KEY UPDATE nazem_student_name = VALUES(nazem_student_name),
             external_organization_id = VALUES(external_organization_id),
             external_organization_name = VALUES(external_organization_name),
             external_circle_id = VALUES(external_circle_id),
             external_circle_name = VALUES(external_circle_name),
             match_confidence = VALUES(match_confidence), status = 'linked', last_verified_at = NOW(3)`,
      [
        teacherId,
        student.id,
        candidate.nazemStudentId,
        candidate.nazemStudentName,
        candidate.externalOrganizationId,
        candidate.externalOrganizationName,
        candidate.externalCircleId,
        candidate.externalCircleName,
        calculateNameMatchConfidence(student.name, candidate.nazemStudentName),
      ]
    );
    await connection.query(
      `UPDATE nazem_plan_candidates SET ruwasi_student_id = ?,
            discovery_status = IF(discovery_status IN ('linked','imported','ignored'), discovery_status,
              'discovered'),
            last_error_code = NULL, last_error = NULL
           WHERE teacher_id = ? AND nazem_student_id = ?`,
      [student.id, teacherId, candidate.nazemStudentId]
    );
    studentByExternalId.set(candidate.nazemStudentId, Number(student.id));
  }
}

/** Queue one local daily update and mark all related recitation links pending. */
async function queueLocalDailyConflict(connection, conflict) {
  await enqueueNazemSyncJob(connection, {
    operationType: 'recitation.submit',
    entityType: 'recitation_day',
    entityId: conflict.entityId,
    teacherId: conflict.teacherId,
    studentId: conflict.studentId,
    payload: { dailyFollowUpId: conflict.entityId, force: true, conflictId: conflict.id },
    idempotencyKey: `nazem:conflict:${conflict.id}:use-ruwasi`,
  });
  await connection.query(
    `UPDATE nazem_daily_follow_up_links SET sync_status = 'pending',
            last_error_code = NULL, last_error = NULL WHERE id = ? AND teacher_id = ?`,
    [conflict.entityId, conflict.teacherId]
  );
  await connection.query(
    `UPDATE nazem_recitation_links SET sync_status = 'pending',
            last_error_code = NULL, last_error = NULL WHERE daily_follow_up_id = ? AND teacher_id = ?`,
    [conflict.entityId, conflict.teacherId]
  );
}

async function queueLocalRecitationConflict(connection, conflict) {
  await enqueueNazemSyncJob(connection, {
    operationType: 'recitation.submit',
    entityType: 'recitation',
    entityId: conflict.entityId,
    teacherId: conflict.teacherId,
    studentId: conflict.studentId,
    payload: { attemptId: conflict.entityId, force: true, conflictId: conflict.id },
    idempotencyKey: `nazem:conflict:${conflict.id}:use-ruwasi`,
  });
  await connection.query(
    "UPDATE nazem_recitation_links SET sync_status = 'pending', last_error_code = NULL, last_error = NULL WHERE ruwasi_recitation_id = ? AND teacher_id = ?",
    [conflict.entityId, conflict.teacherId]
  );
}

/** Queue an idempotent local plan update and mark its link pending. */
async function queueLocalPlanConflict(connection, conflict) {
  await enqueueNazemSyncJob(connection, {
    operationType: 'plan.upsert',
    entityType: 'plan',
    entityId: conflict.entityId,
    teacherId: conflict.teacherId,
    studentId: conflict.studentId,
    payload: { planId: conflict.entityId, studentId: conflict.studentId, conflictId: conflict.id },
    idempotencyKey: `nazem:conflict:${conflict.id}:use-ruwasi`,
  });
  await connection.query(
    `UPDATE nazem_plan_links SET sync_status = 'pending', last_error_code = NULL, last_error = NULL
           WHERE ruwasi_plan_id = ? AND teacher_id = ?`,
    [conflict.entityId, conflict.teacherId]
  );
}

/** Import the selected remote plan and attribute the resolution to the authenticated actor. */
async function acceptNazemPlanConflict(importPlanCandidate, connection, conflict, importedPlan, req) {
  if (typeof importPlanCandidate !== 'function') throw invalid('استيراد خطط ناظم غير متاح.');
  const [[candidate]] = await connection.query(
    `SELECT id, progress_snapshot AS progressSnapshot
           FROM nazem_plan_candidates
           WHERE teacher_id = ? AND ruwasi_student_id = ? AND nazem_plan_id = ?
           ORDER BY last_seen_at DESC LIMIT 1 FOR UPDATE`,
    [conflict.teacherId, conflict.studentId, conflict.nazemPlanId]
  );
  if (!candidate) throw invalid('أعد التحقق من حساب ناظم قبل اعتماد خطته.');
  importedPlan = await importPlanCandidate(connection, {
    teacherId: conflict.teacherId,
    studentId: conflict.studentId,
    nazemStudentId: conflict.nazemStudentId,
    nazemPlanId: conflict.nazemPlanId,
    remoteSnapshot: parseSnapshot(conflict.remoteSnapshot),
    progressSnapshot: parseSnapshot(candidate.progressSnapshot),
  });
  await connection.query(
    `UPDATE nazem_plan_candidates SET discovery_status = 'imported',
            last_error_code = NULL, last_error = NULL, resolved_by_role = ?, resolved_by_id = ?,
            resolved_at = NOW(3) WHERE id = ?`,
    [req.auth?.role || 'manager', Number(req.auth?.id || 0) || null, candidate.id]
  );
  return importedPlan;
}

/** Apply the explicitly selected remote daily result inside the conflict-resolution transaction. */
async function acceptNazemDailyConflict(conflict, connection) {
  const remote = parseSnapshot(conflict.remoteSnapshot) || {};
  const local = parseSnapshot(conflict.localSnapshot) || {};
  const remoteCompleted = isNazemFollowUpCompleted(remote.status);
  const remoteErrors = Math.max(0, Number(remote.mistake || 0)) + Math.max(0, Number(remote.tune || 0));
  const remoteRepeatCount = remoteCompleted
    ? Math.min(30, Math.max(1, Math.trunc(Number(remote.repetition || 1))))
    : 0;
  const remoteListeningCount = remoteCompleted && Number(remote.hearing) === 1 ? 1 : 0;
  const remoteLinkCount = remoteCompleted ? normalizeNazemLinkCount(remote.link) : 0;
  const taskIds = Array.isArray(local.taskIds) ? local.taskIds.map(Number).filter(Boolean) : [];
  const attemptIds = Array.isArray(local.attemptIds) ? local.attemptIds.map(Number).filter(Boolean) : [];
  if (!taskIds.length || !attemptIds.length) throw invalid('تعذر تحديد مقاطع المنصة المرتبطة بنتيجة ناظم.');
  const placeholders = taskIds.map(() => '?').join(',');
  const [tasks] = await connection.query(
    `SELECT id, evaluation_score AS score, evaluation_passing_score AS passingScore,
            evaluation_max_score AS maxScore
           FROM student_quran_tasks WHERE id IN (${placeholders}) FOR UPDATE`,
    taskIds
  );
  await saveRemoteConflictTaskScores({ tasks, remoteCompleted, taskIds, connection, remoteErrors, conflict });
  const attemptPlaceholders = attemptIds.map(() => '?').join(',');
  await connection.query(
    `UPDATE student_quran_recitation_attempts attempt
           JOIN student_quran_tasks task ON task.id = attempt.task_id
           SET attempt.teacher_completed = ?, attempt.evaluation_score = task.evaluation_score,
             attempt.mistake_count = CASE WHEN attempt.id = ? THEN ? ELSE 0 END
           WHERE attempt.id IN (${attemptPlaceholders})`,
    [remoteCompleted ? 1 : 0, attemptIds[0], remoteErrors, ...attemptIds]
  );
  await saveRemoteConflictRepetition({ local, conflict, connection, remoteCompleted, remoteRepeatCount, remoteListeningCount, remoteLinkCount, taskIds });
  if (remote.attendanceStatus != null && local.date) {
    await applyRemoteAttendanceToRuwasi(connection, conflict.studentId, {
      attendanceStatus: remote.attendanceStatus,
      date: local.date,
    }, { inTransaction: true });
  }
  await connection.query(
    `UPDATE nazem_daily_follow_up_links SET sync_status = 'synced', remote_snapshot = ?,
            last_synced_at = NOW(3), last_remote_checked_at = NOW(3),
            last_error_code = NULL, last_error = NULL WHERE id = ? AND teacher_id = ?`,
    [JSON.stringify(remote), conflict.entityId, conflict.teacherId]
  );
  await connection.query(
    `UPDATE nazem_recitation_links SET sync_status = 'synced', remote_snapshot = ?,
            last_synced_at = NOW(3), last_error_code = NULL, last_error = NULL
           WHERE daily_follow_up_id = ? AND teacher_id = ?`,
    [JSON.stringify(remote), conflict.entityId, conflict.teacherId]
  );
}

/** Apply the selected repetition and listening counts to the same student plan and scheduled range. */
async function saveRemoteConflictRepetition({ local, conflict, connection, remoteCompleted, remoteRepeatCount, remoteListeningCount, remoteLinkCount, taskIds }) {
  if (local.taskType === 'memorization' && conflict.planId && local.date) {
    await connection.query(
      `UPDATE student_quran_tasks SET student_status = ?,
              actual_to_page = CASE WHEN ? = 1 THEN to_page ELSE NULL END,
              actual_to_surah = CASE WHEN ? = 1 THEN to_surah ELSE NULL END,
              actual_to_ayah = CASE WHEN ? = 1 THEN to_ayah ELSE NULL END,
              actual_repeat_count = ?, actual_listening_count = ?,
              execution_state = CASE WHEN ? = 1 THEN 'complete' ELSE NULL END,
              execution_actor_role = 'teacher', execution_actor_id = ?, executed_at = NOW(3)
             WHERE plan_id = ? AND student_id = ? AND task_date = ? AND task_type = 'repeat'
               AND from_surah = ? AND from_ayah = ? AND to_surah = ? AND to_ayah = ?`,
      [
        remoteCompleted ? 'done' : 'not_done', remoteCompleted ? 1 : 0,
        remoteCompleted ? 1 : 0, remoteCompleted ? 1 : 0,
        remoteRepeatCount, remoteListeningCount, remoteCompleted ? 1 : 0,
        conflict.teacherId, conflict.planId, conflict.studentId, local.date,
        Number(local.fromSurahId), Number(local.fromAyah),
        Number(local.scheduledToSurahId), Number(local.scheduledToAyah),
      ]
    );
    await connection.query(
      `UPDATE student_quran_tasks SET actual_link_count = NULL
             WHERE plan_id = ? AND student_id = ? AND task_date = ? AND task_type = 'memorization'`,
      [conflict.planId, conflict.studentId, local.date]
    );
    await connection.query(
      'UPDATE student_quran_tasks SET actual_link_count = ? WHERE id = ?',
      [remoteLinkCount, taskIds[0]]
    );
  }
}

/** Save the remote pass/fail outcome without awarding duplicate local points. */
async function saveRemoteConflictTaskScores({ tasks, remoteCompleted, taskIds, connection, remoteErrors, conflict }) {
  for (const task of tasks) {
    const passingScore = Math.max(1, Number(task.passingScore || 85));
    const currentScore = Number(task.score || 0);
    const score = remoteCompleted
      ? Math.max(passingScore, currentScore)
      : Math.max(0, Math.min(passingScore - 0.01, currentScore || passingScore - 1));
    const isFirst = Number(task.id) === Number(taskIds[0]);
    await connection.query(
      `UPDATE student_quran_tasks SET mistake_count = ?, evaluation_score = ?,
              teacher_completed = ?, teacher_rating_key = 'score', teacher_rating_label = ?,
              evaluated_by = ?, evaluated_at = NOW(3)
             WHERE id = ?`,
      [isFirst ? remoteErrors : 0, score, remoteCompleted ? 1 : 0,
      remoteCompleted ? 'متقن' : 'يحتاج إعادة', conflict.teacherId, task.id]
    );
  }
}
