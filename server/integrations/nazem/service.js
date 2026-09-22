import { importNazemLinkResult } from './linkResultImport.js';
import { loadConfirmedNazemRecordIds, recitationIdentityFromReceipt } from './followUpCycles.js';
import { applyRecitationWriteIdentity, hasLocalRecitation, recitationWriteJournal, recoverRejectedRecitationWrite, resolveLegacyRecitationTarget, validateRecitationTarget } from './recitationSubmission.js';
import { recoverNazemAuthenticationJobs } from './authenticationRecovery.js';
import { reconcileConfirmedRecitationJobs } from './confirmedRecitationJobs.js';
import { nazemFollowUpMetricsMatch } from './followUpMetrics.js';
import { loadRecitationRewardSettings } from '../../services/recitationRewards.js';
import { recitationFacesFromLines } from '../../services/recitationSegments.js';
import { calculateRecitationScore, getRecitationEvaluationPolicy } from '../../../shared/evaluation-settings.js';
import { enqueueNazemPointReconciliation } from '../../services/nazemPointReconciliation.js';
import { getBusinessDate } from '../../../shared/business-date.js';
import { loadAttendancePointSettings, saveAttendanceWithPoints } from '../../services/attendancePoints.js';
import { revalidatePendingNazemIdentity } from './revalidatePendingIdentity.js';
import crypto from 'node:crypto';
import { db } from '../../db.js';
import {
  calculateNameMatchConfidence,
  findUniqueArabicPersonNameMatch,
  isNazemExternalStudentId,
  isNazemFollowUpCompleted,
} from '../../../shared/nazem-integration.js';
import { partitionQuranRevisionPages } from '../../../shared/quran-revision-priority.js';
import { normalizeNazemLinkCount } from '../../../shared/nazem-link-count.js';
import { decryptNazemJson, decryptNazemSecret, encryptNazemJson } from './crypto.js';
import { NazemAdapter, nazemPlanBundleMatches } from './adapter.js';
import {
  mapRuwasiAttendanceStatusToNazem,
  mapRuwasiPlanBundleToNazem,
  mapNazemOwnedPlanSnapshot,
  mapRuwasiRecitationGroupToNazem,
  mapRuwasiRecitationToNazem,
  mapNazemAmountToRuwasi,
  normalizeNazemText,
  nazemRemoteErrorCount,
} from './mapping.js';
import { reviewNazemError, transientNazemError } from './errors.js';
import { createNazemIdentityFingerprint } from './identity.js';
import { syncNazemScheduledTaskRange } from './dailyTasks.js';
import { nazemTaskTrack } from './taskTrack.js';
import { describeNazemFollowUpIssues, importNazemFollowUpHistory, markNazemFollowUpRefreshSucceeded } from './followUpImport.js';
import { recordNazemStudentRefresh } from './refreshState.js';
import { latestNazemScheduleSql, preservesPendingNazemLate } from './scheduleAuthority.js';
import { findNazemLateSourceDate } from './lateSourceDate.js';
import { submitWithNazemAuthority } from './recitationAuthority.js';
import { getNazemQuranPosition } from './quranPosition.js';
import {
  enqueueMissingNazemAttendance,
  enqueueNazemRecitation,
  updateNazemJobProgress,
} from './queue.js';

const safeJson = (value, fallback = {}) => {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
};

const snapshotHash = (value) => crypto.createHash('sha256')
  .update(JSON.stringify(value || {}))
  .digest('hex');

async function saveOpenNazemConflict(connection, {
  entityType,
  entityId,
  teacherId,
  localSnapshot,
  remoteSnapshot,
  baseSnapshot = null,
}) {
  const [[existing]] = await connection.query(
    `SELECT id FROM nazem_sync_conflicts
     WHERE entity_type = ? AND entity_id = ? AND teacher_id = ? AND status = 'open'
     ORDER BY id DESC LIMIT 1`,
    [entityType, entityId, teacherId],
  );
  const values = [
    JSON.stringify(localSnapshot || {}),
    JSON.stringify(remoteSnapshot || {}),
    baseSnapshot == null ? null : JSON.stringify(baseSnapshot),
  ];
  if (existing) {
    await connection.query(
      `UPDATE nazem_sync_conflicts SET local_snapshot = ?, remote_snapshot = ?,
        base_snapshot = ?, updated_at = NOW(3) WHERE id = ?`,
      [...values, existing.id],
    );
    return Number(existing.id);
  }
  const [result] = await connection.query(
    `INSERT INTO nazem_sync_conflicts
      (entity_type, entity_id, teacher_id, local_snapshot, remote_snapshot, base_snapshot)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [entityType, entityId, teacherId, ...values],
  );
  return Number(result.insertId || 0) || null;
}

async function resolveOpenNazemConflicts(connection, entityType, entityId, resolution) {
  await connection.query(
    `UPDATE nazem_sync_conflicts SET status = 'resolved', resolution = ?, resolved_at = NOW(3)
     WHERE entity_type = ? AND entity_id = ? AND status = 'open'`,
    [resolution, entityType, entityId],
  );
}

const translateAdapterFailure = (cause, action) => {
  if (cause?.name === 'NazemIntegrationError') return cause;
  if (/timeout|navigation|net::|ECONNRESET|ENOTFOUND/i.test(String(cause?.message || ''))) {
    return transientNazemError(`تعذر ${action} بسبب بطء أو انقطاع الاتصال بناظم.`, 'NAZEM_OPERATION_TIMEOUT', cause);
  }
  return reviewNazemError(`تغيرت واجهة ناظم أثناء ${action} وتحتاج المحولات إلى مراجعة.`, 'NAZEM_FORM_CHANGED', cause);
};

const normalizeRemotePlanItemSnapshot = (plan) => {
  if (!plan) return null;
  const normalized = {
    studentName: normalizeNazemText(plan.studentName),
    tab: normalizeNazemText(plan.tab) || null,
    amount: normalizeNazemText(plan.amount) || null,
    direction: normalizeNazemText(plan.direction) || null,
    startSurah: normalizeNazemText(plan.startSurah) || null,
    startAyah: Number(plan.startAyah || 0),
    endSurah: normalizeNazemText(plan.endSurah) || null,
    endAyah: Number(plan.endAyah || 0),
    repeatCount: plan.repeatCount == null ? null : Number(plan.repeatCount),
    linkCount: plan.linkCount == null ? null : Number(plan.linkCount),
  };
  const isEmptyRevision = normalized.tab === 'المراجعة'
    && !normalized.startSurah
    && !normalized.startAyah
    && !normalized.endSurah
    && !normalized.endAyah;
  return isEmptyRevision ? null : normalized;
};

export const normalizeRemotePlanSnapshot = (plan) => {
  if (!plan) return null;
  if (plan.primary) {
    return {
      externalId: String(plan.externalId || plan.primary.externalId || ''),
      primary: normalizeRemotePlanItemSnapshot(plan.primary),
      revision: normalizeRemotePlanItemSnapshot(plan.revision),
    };
  }
  return {
    externalId: String(plan.externalId || ''),
    ...normalizeRemotePlanItemSnapshot(plan),
  };
};

const PLAN_DIFFERENCE_FIELDS = Object.freeze([
  ['tab', 'المسار'],
  ['amount', 'المقدار'],
  ['direction', 'الاتجاه'],
  ['startSurah', 'سورة البداية'],
  ['startAyah', 'آية البداية'],
  ['endSurah', 'سورة النهاية'],
  ['endAyah', 'آية النهاية'],
  ['repeatCount', 'التكرار'],
  ['linkCount', 'الربط'],
]);

export const describeNazemPlanDifference = (localSnapshot, remoteSnapshot) => {
  const differences = [];
  for (const sectionKey of ['primary', 'revision']) {
    const local = localSnapshot?.[sectionKey] || null;
    const remote = remoteSnapshot?.[sectionKey] || null;
    const section = remote?.tab || local?.tab || (sectionKey === 'primary' ? 'الخطة الأساسية' : 'المراجعة');
    if (!local && remote) {
      differences.push(`أضيف مسار ${section}`);
      continue;
    }
    if (local && !remote) {
      differences.push(`حُذف مسار ${section}`);
      continue;
    }
    if (!local || !remote) continue;
    appendNazemFieldDifferences(local, remote, differences, section);
  }
  return differences.join('، ').slice(0, 420);
};

export const requiresNazemIdentityReview = ({
  localTeacherName,
  externalTeacherName,
  identityWasConfirmed = false,
}) => !identityWasConfirmed
  && calculateNameMatchConfidence(localTeacherName, externalTeacherName) < 0.8;

/** Describe changed plan fields using the existing localized labels. */
function appendNazemFieldDifferences(local, remote, differences, section) {
  for (const [field, label] of PLAN_DIFFERENCE_FIELDS) {
    const localValue = String(local[field] ?? '—');
    const remoteValue = String(remote[field] ?? '—');
    if (localValue !== remoteValue) {
      differences.push(`${section} — ${label}: ${localValue} ← ${remoteValue}`);
    }
  }
}

async function loadAccount(connection, teacherId, { forVerification = false } = {}) {
  const [[account]] = await connection.query(
    `SELECT account.id, account.teacher_id AS teacherId, account.encrypted_username AS encryptedUsername,
      account.encrypted_password AS encryptedPassword,
      account.encrypted_session_state AS encryptedSessionState,
      account.identity_confirmed_at AS identityConfirmedAt,
      account.identity_confirmed_fingerprint AS identityConfirmedFingerprint,
      account.external_teacher_name AS previousExternalTeacherName,
      account.external_organization_name AS previousExternalOrganizationName,
      account.status,
      supervisor.name AS teacherName
     FROM nazem_accounts account
     JOIN supervisors supervisor ON supervisor.id = account.teacher_id
     WHERE account.teacher_id = ? LIMIT 1`,
    [teacherId],
  );
  if (!account) throw reviewNazemError('حساب المعلم غير مرتبط بناظم.', 'NAZEM_ACCOUNT_NOT_LINKED');
  if (!forVerification && account.status !== 'connected') {
    throw reviewNazemError('يجب التحقق من حساب المعلم وربطه قبل المزامنة.', 'NAZEM_ACCOUNT_NOT_CONNECTED');
  }
  return account;
}

async function openAdapterForTeacher(connection, teacherId, options = {}) {
  const account = await loadAccount(connection, teacherId, options);
  const adapter = new NazemAdapter({
    resolveLateSourceDate: (scope) => findNazemLateSourceDate(connection, { ...scope, teacherId }),
    username: decryptNazemSecret(account.encryptedUsername),
    password: decryptNazemSecret(account.encryptedPassword),
    sessionState: account.encryptedSessionState
      ? decryptNazemJson(account.encryptedSessionState)
      : null,
  });
  await adapter.open();
  return { account, adapter };
}

async function persistNazemSession(connection, teacherId, adapter) {
  await connection.query(
    `UPDATE nazem_accounts SET encrypted_session_state = ?, status = 'connected',
      last_verified_at = NOW(3), last_successful_login_at = NOW(3),
      last_error_code = NULL, last_error = NULL WHERE teacher_id = ?`,
    [encryptNazemJson(await adapter.getSessionState()), teacherId],
  );
  await recoverNazemAuthenticationJobs(connection, teacherId);
}

async function restoreImportedNazemPlanLink(connection, {
  teacherId,
  studentId,
  planId,
  planLink,
}) {
  if (!planLink?.nazemPlanId || planLink.syncStatus === 'synced') return planLink;
  const [[importedCandidate]] = await connection.query(
    `SELECT id FROM nazem_plan_candidates
     WHERE teacher_id = ? AND ruwasi_student_id = ? AND nazem_plan_id = ?
       AND discovery_status = 'imported'
     ORDER BY updated_at DESC, id DESC LIMIT 1`,
    [teacherId, studentId, planLink.nazemPlanId],
  );
  if (!importedCandidate) return planLink;
  await connection.query(
    `UPDATE nazem_plan_links SET sync_status = 'synced', last_synced_at = NOW(3),
      last_remote_checked_at = NOW(3), last_error_code = NULL, last_error = NULL
     WHERE ruwasi_plan_id = ? AND teacher_id = ? AND ruwasi_student_id = ?`,
    [planId, teacherId, studentId],
  );
  await connection.query(
    `UPDATE nazem_sync_jobs SET status = 'dismissed', lease_owner = NULL,
      lease_expires_at = NULL, last_error_code = 'NAZEM_IMPORTED_PLAN_AUTHORITATIVE',
      last_error = 'خطة ناظم المستوردة هي المصدر المعتمد.'
     WHERE operation_type = 'plan.upsert' AND entity_type = 'plan' AND entity_id = ?
       AND status IN ('pending','retrying','failed','blocked','requires_review','conflict')`,
    [planId],
  );
  return { ...planLink, syncStatus: 'synced' };
}

async function saveDiscoveredStudents(connection, teacherId, remoteStudents) {
  const discoveryStartedAt = new Date();
  const [localStudents] = await connection.query(
    `SELECT DISTINCT student.id, student.name
     FROM students student
     JOIN supervisor_committees scope ON scope.committee_id = student.committee_id
     WHERE scope.supervisor_id = ?
     ORDER BY student.name`,
    [teacherId],
  );
  const localMatches = new Map();
  for (const remote of remoteStudents) {
    const fingerprint = snapshotHash({
      externalId: remote.externalId || null,
      name: remote.name,
      organization: remote.organization?.name,
      circle: remote.circle?.name,
    });
    await connection.query(
      `INSERT INTO nazem_student_candidates
        (teacher_id, candidate_fingerprint, nazem_student_id, nazem_student_name,
         external_organization_id, external_organization_name, external_circle_id, external_circle_name,
         remote_snapshot)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE nazem_student_id = VALUES(nazem_student_id),
         nazem_student_name = VALUES(nazem_student_name),
         external_organization_id = VALUES(external_organization_id),
         external_organization_name = VALUES(external_organization_name),
         external_circle_id = VALUES(external_circle_id), external_circle_name = VALUES(external_circle_name),
         remote_snapshot = VALUES(remote_snapshot),
         last_seen_at = NOW(3)`,
      [
        teacherId,
        fingerprint,
        remote.externalId || null,
        remote.name,
        remote.organization?.id || null,
        remote.organization?.name || null,
        remote.circle?.id || null,
        remote.circle?.name || null,
        JSON.stringify(remote.profile || null),
      ],
    );
    const uniqueMatch = findUniqueArabicPersonNameMatch(localStudents, remote.name);
    if (!uniqueMatch || !isNazemExternalStudentId(remote.externalId)) continue;
    const existingForLocal = localMatches.get(uniqueMatch.candidate.id);
    if (existingForLocal && existingForLocal.confidence >= uniqueMatch.confidence) continue;
    localMatches.set(uniqueMatch.candidate.id, { ...remote, confidence: uniqueMatch.confidence });
  }
  for (const [studentId, remote] of localMatches) {
    await connection.query(
      `INSERT INTO nazem_student_links
        (teacher_id, ruwasi_student_id, nazem_student_id, nazem_student_name,
         external_organization_id, external_organization_name, external_circle_id, external_circle_name,
         match_confidence, status, last_verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'linked', NOW(3))
       ON DUPLICATE KEY UPDATE
         nazem_student_id = IF(status = 'linked', nazem_student_id, VALUES(nazem_student_id)),
         nazem_student_name = IF(status = 'linked', nazem_student_name, VALUES(nazem_student_name)),
         external_organization_id = IF(status = 'linked', external_organization_id, VALUES(external_organization_id)),
         external_organization_name = IF(status = 'linked', external_organization_name, VALUES(external_organization_name)),
         external_circle_id = IF(status = 'linked', external_circle_id, VALUES(external_circle_id)),
         external_circle_name = IF(status = 'linked', external_circle_name, VALUES(external_circle_name)),
         match_confidence = GREATEST(COALESCE(match_confidence, 0), VALUES(match_confidence)),
         status = IF(status = 'linked', status, VALUES(status)), last_verified_at = NOW(3)`,
      [
        teacherId,
        studentId,
        remote.externalId,
        remote.name,
        remote.organization?.id || null,
        remote.organization?.name || null,
        remote.circle?.id || null,
        remote.circle?.name || null,
        remote.confidence,
      ],
    );
  }
  await connection.query(
    'DELETE FROM nazem_student_candidates WHERE teacher_id = ? AND last_seen_at < ?',
    [teacherId, discoveryStartedAt],
  );
  return { remoteCount: remoteStudents.length, autoLinkedCount: localMatches.size };
}

async function saveDiscoveredPlans(connection, teacherId, remotePlans, issues = [], {
  preserveUndiscovered = false,
} = {}) {
  if (!issues.length && !preserveUndiscovered) {
    await connection.query(
      `UPDATE nazem_plan_candidates SET discovery_status = 'stale',
        last_error_code = 'NAZEM_REMOTE_PLAN_NOT_SEEN',
        last_error = 'لم تظهر الخطة في آخر فحص لحساب ناظم.'
       WHERE teacher_id = ? AND discovery_status IN ('discovered','requires_review')`,
      [teacherId],
    );
  }
  for (const remotePlan of remotePlans) {
    const remoteSnapshot = {
      ...normalizeRemotePlanSnapshot(remotePlan),
      startDate: remotePlan.startDate || null,
    };
    await connection.query(
      `INSERT INTO nazem_plan_candidates
        (teacher_id, ruwasi_student_id, nazem_student_id, nazem_student_name,
         nazem_plan_id, remote_snapshot, progress_snapshot, discovery_status,
         last_error_code, last_error)
       SELECT ?, studentLink.ruwasi_student_id, ?, ?, ?, ?, ?,
         IF(studentLink.ruwasi_student_id IS NULL, 'requires_review', 'discovered'),
         IF(studentLink.ruwasi_student_id IS NULL, 'NAZEM_PLAN_STUDENT_UNMATCHED', NULL),
         IF(studentLink.ruwasi_student_id IS NULL, 'طابق طالب ناظم مع طالب المنصة أولًا.', NULL)
       FROM (SELECT 1) seed
       LEFT JOIN nazem_student_links studentLink
         ON studentLink.teacher_id = ? AND studentLink.nazem_student_id = ?
        AND studentLink.status = 'linked'
       ON DUPLICATE KEY UPDATE ruwasi_student_id = VALUES(ruwasi_student_id),
         nazem_student_name = VALUES(nazem_student_name),
         remote_snapshot = VALUES(remote_snapshot), progress_snapshot = VALUES(progress_snapshot),
         discovery_status = IF(discovery_status IN ('imported','linked','ignored'), discovery_status, VALUES(discovery_status)),
         last_error_code = IF(discovery_status IN ('imported','linked','ignored'), last_error_code, VALUES(last_error_code)),
         last_error = IF(discovery_status IN ('imported','linked','ignored'), last_error, VALUES(last_error)),
         last_seen_at = NOW(3)`,
      [
        teacherId,
        remotePlan.student.externalId,
        remotePlan.student.name,
        remotePlan.externalId,
        JSON.stringify(remoteSnapshot),
        JSON.stringify(remotePlan.progress || null),
        teacherId,
        remotePlan.student.externalId,
      ],
    );
  }

  for (const issue of issues) {
    if (!isNazemExternalStudentId(issue.studentExternalId) || !issue.groupExternalId) continue;
    await connection.query(
      `UPDATE nazem_plan_candidates SET discovery_status = 'requires_review',
        last_error_code = ?, last_error = ?, last_seen_at = NOW(3)
       WHERE teacher_id = ? AND nazem_plan_id = ? AND nazem_student_id = ?
         AND discovery_status NOT IN ('imported','linked','ignored')`,
      [issue.errorCode, issue.message, teacherId, issue.groupExternalId, issue.studentExternalId],
    );
  }

  const [candidates] = await connection.query(
    `SELECT candidate.id, candidate.ruwasi_student_id AS studentId,
      candidate.nazem_student_id AS nazemStudentId, candidate.nazem_plan_id AS nazemPlanId,
      candidate.remote_snapshot AS remoteSnapshot, candidate.progress_snapshot AS progressSnapshot,
      (SELECT COUNT(*) FROM nazem_plan_candidates sibling
       WHERE sibling.teacher_id = candidate.teacher_id
         AND sibling.ruwasi_student_id = candidate.ruwasi_student_id
         AND sibling.discovery_status IN ('discovered','requires_review')) AS candidateCount,
      plan.id AS localPlanId
     FROM nazem_plan_candidates candidate
     LEFT JOIN student_quran_plans plan
       ON plan.student_id = candidate.ruwasi_student_id AND plan.status = 'active'
     WHERE candidate.teacher_id = ? AND candidate.discovery_status IN ('discovered','requires_review')
       AND candidate.last_seen_at >= DATE_SUB(NOW(3), INTERVAL 10 MINUTE)`,
    [teacherId],
  );
  let linked = 0;
  let review = 0;
  for (const candidate of candidates) {
    ({ linked, review } = await reconcileDiscoveredPlan({ connection, teacherId, candidate, linked, review }));
  }
  return {
    remotePlanCount: remotePlans.length,
    linkedPlanCount: linked,
    reviewPlanCount: review,
    discoveryIssueCount: issues.length,
  };
}

async function verifyAccount(connection, job) {
  const { account, adapter } = await openAdapterForTeacher(connection, job.teacherId, { forVerification: true });
  try {
    await connection.query("UPDATE nazem_accounts SET status = 'verifying', last_error_code = NULL, last_error = NULL WHERE id = ?", [account.id]);
    const context = await adapter.login({ requireIdentity: true });
    const externalTeacherName = context.teacherName;
    const externalOrganizationName = context.organizationName;
    const currentIdentityFingerprint = createNazemIdentityFingerprint(externalTeacherName, externalOrganizationName);
    const previousIdentityFingerprint = account.previousExternalTeacherName
      ? createNazemIdentityFingerprint(
        account.previousExternalTeacherName,
        account.previousExternalOrganizationName,
      )
      : null;
    const identityChanged = Boolean(
      previousIdentityFingerprint && previousIdentityFingerprint !== currentIdentityFingerprint,
    );
    const identityWasConfirmed = Boolean(
      account.identityConfirmedAt
      && account.identityConfirmedFingerprint === currentIdentityFingerprint,
    );
    const identityNameMismatch = requiresNazemIdentityReview({
      localTeacherName: account.teacherName,
      externalTeacherName,
      identityWasConfirmed,
    });
    if (identityNameMismatch && !identityWasConfirmed) {
      const errorCode = 'NAZEM_TEACHER_MISMATCH';
      const errorMessage = 'اسم معلم ناظم لا يطابق المعلم المرتبط؛ يلزم اعتماد الهوية قبل المزامنة.';
      await connection.query(
        `UPDATE nazem_accounts SET status = 'requires_review', external_teacher_name = ?,
          external_organization_name = ?, last_verified_at = NOW(3),
          last_error_code = ?, last_error = ? WHERE id = ?`,
        [externalTeacherName, externalOrganizationName, errorCode, errorMessage, account.id],
      );
      throw reviewNazemError(errorMessage, errorCode);
    }
    if (identityChanged && !identityWasConfirmed) {
      const errorCode = 'NAZEM_ACCOUNT_IDENTITY_CHANGED';
      const errorMessage = 'هوية حساب ناظم أو الجهة تغيّرت؛ يلزم اعتمادها قبل نقل الربط.';
      await connection.query(
        `UPDATE nazem_accounts SET status = 'requires_review', external_teacher_name = ?,
          external_organization_name = ?, last_verified_at = NOW(3),
          last_error_code = ?, last_error = ? WHERE id = ?`,
        [externalTeacherName, externalOrganizationName, errorCode, errorMessage, account.id],
      );
      throw reviewNazemError(errorMessage, errorCode);
    }
    await connection.query(
      `UPDATE nazem_accounts SET status = 'connected', encrypted_session_state = ?,
        external_teacher_name = ?, external_organization_name = ?, last_verified_at = NOW(3),
        last_successful_login_at = NOW(3), last_error_code = NULL, last_error = NULL WHERE id = ?`,
      [encryptNazemJson(context.sessionState), externalTeacherName, externalOrganizationName, account.id],
    );
    return {
      teacherName: externalTeacherName,
      organizationName: externalOrganizationName,
    };
  } catch (cause) {
    throw translateAdapterFailure(cause, 'التحقق من الحساب');
  } finally {
    await adapter.close();
  }
}

async function loadPlan(connection, planId) {
  const [[plan]] = await connection.query(
    `SELECT plan.id, plan.student_id AS studentId, plan.status, plan.plan_version AS planVersion,
      plan.track, DATE_FORMAT(plan.start_date, '%Y-%m-%d') AS startDate,
      plan.start_surah AS startSurah, plan.start_ayah AS startAyah,
      startSurah.name_arabic AS startSurahName, plan.start_page AS startPage,
      plan.end_surah AS endSurah, plan.end_ayah AS endAyah,
      endSurah.name_arabic AS endSurahName, plan.end_page AS endPage,
      plan.daily_pages AS dailyPages, plan.link_pages AS linkPages,
      plan.next_memorization_page AS nextMemorizationPage
     FROM student_quran_plans plan
     JOIN quran_surahs startSurah ON startSurah.surah_number = plan.start_surah
     JOIN quran_surahs endSurah ON endSurah.surah_number = plan.end_surah
     WHERE plan.id = ? LIMIT 1`,
    [planId],
  );
  if (!plan) throw reviewNazemError('خطة المنصة غير موجودة.', 'RUWASI_PLAN_NOT_FOUND');
  const repeatSetting = plan.track === 'mastery' ? 'masteryRepeatCount' : 'memorizationRepeatCount';
  const [[repeat]] = await connection.query(
    `SELECT COALESCE(
       (
         SELECT CAST(JSON_UNQUOTE(JSON_EXTRACT(planLink.remote_snapshot, '$.primary.repeatCount')) AS UNSIGNED)
         FROM nazem_plan_links planLink
         WHERE planLink.ruwasi_plan_id = ?
           AND planLink.sync_status IN ('synced','pending','syncing','retrying','conflict','requires_review')
         ORDER BY planLink.id DESC
         LIMIT 1
       ),
       (SELECT CAST(setting_value AS UNSIGNED) FROM app_settings WHERE setting_key = ? LIMIT 1),
       10
     ) AS value
     `,
    [plan.id, repeatSetting],
  );
  return { ...plan, repeatCount: Number(repeat?.value || 10) };
}

const quranPositionValue = (surah, ayah) => (Number(surah) * 1000) + Number(ayah);

async function loadPlanReviewRange(connection, plan) {
  const [ranges] = await connection.query(
    `SELECT prior.start_surah AS startSurah, prior.start_ayah AS startAyah,
      prior.start_page AS startPage, prior.end_surah AS endSurah,
      prior.end_ayah AS endAyah, prior.end_page AS endPage
     FROM student_quran_plan_prior_memorization prior
     WHERE prior.plan_id = ?
     ORDER BY prior.start_page, prior.start_surah, prior.start_ayah`,
    [plan.id],
  );
  if (!ranges.length) return null;
  const firstPage = Math.min(...ranges.flatMap((range) => [Number(range.startPage), Number(range.endPage)]));
  const lastPage = Math.max(...ranges.flatMap((range) => [Number(range.startPage), Number(range.endPage)]));
  const [ayahs] = await connection.query(
    `SELECT page_number AS page, surah_number AS surah, ayah_number AS ayah,
      surah_name AS surahName
     FROM quran_ayah_pages
     WHERE page_number BETWEEN ? AND ?
     ORDER BY page_number, surah_number, ayah_number`,
    [firstPage, lastPage],
  );
  const covered = (ayah) => ranges.some((range) => {
    const start = quranPositionValue(range.startSurah, range.startAyah);
    const end = quranPositionValue(range.endSurah, range.endAyah);
    const value = quranPositionValue(ayah.surah, ayah.ayah);
    return value >= Math.min(start, end) && value <= Math.max(start, end);
  });
  const pageCoverage = new Map();
  for (const ayah of ayahs) {
    const page = Number(ayah.page);
    const state = pageCoverage.get(page) || { allCovered: true, ayahs: [] };
    state.allCovered = state.allCovered && covered(ayah);
    state.ayahs.push(ayah);
    pageCoverage.set(page, state);
  }
  const fullyMemorizedPages = [...pageCoverage.entries()]
    .filter(([, state]) => state.allCovered && state.ayahs.length)
    .map(([page]) => page);
  const direction = Number(plan.startPage) > Number(plan.endPage) ? -1 : 1;
  const revision = partitionQuranRevisionPages({
    memorizedPages: fullyMemorizedPages,
    currentMemorizationPage: plan.nextMemorizationPage || plan.startPage,
    direction,
    linkPages: plan.linkPages,
  });
  const orderedReviewPages = [...revision.review].sort((left, right) => left - right);
  if (!orderedReviewPages.length) return null;
  const groups = [];
  for (const page of orderedReviewPages) {
    const last = groups.at(-1);
    if (last && page === last.at(-1) + 1) last.push(page);
    else groups.push([page]);
  }
  if (groups.length > 1) {
    throw reviewNazemError(
      'مقدار المراجعة في المنصة يحتوي نطاقات منفصلة، بينما ناظم يقبل نطاق مراجعة متصلًا واحدًا فقط.',
      'NAZEM_REVISION_RANGE_DISCONNECTED',
    );
  }
  const reviewPages = groups[0];
  const startAyahs = pageCoverage.get(reviewPages[0])?.ayahs || [];
  const endAyahs = pageCoverage.get(reviewPages.at(-1))?.ayahs || [];
  const start = startAyahs[0];
  const end = endAyahs.at(-1);
  if (!start || !end) return null;
  return {
    startSurah: Number(start.surah),
    startAyah: Number(start.ayah),
    startSurahName: start.surahName,
    endSurah: Number(end.surah),
    endAyah: Number(end.ayah),
    endSurahName: end.surahName,
  };
}

async function getRemoteQuranPosition(connection, surahName, ayah) {
  const position = await getNazemQuranPosition(connection, surahName, ayah);
  if (!position) {
    throw reviewNazemError(
      `تعذر مطابقة ${surahName || 'السورة'} آية ${ayah || '—'} مع مصحف المنصة.`,
      'NAZEM_QURAN_POSITION_UNMATCHED',
    );
  }
  return position;
}

async function applyRemotePlanToRuwasi(connection, {
  link,
  teacherId,
  remoteSnapshot,
}) {
  const primary = remoteSnapshot?.primary;
  if (!primary || !['الحفظ', 'الإتقان'].includes(primary.tab)) {
    throw reviewNazemError('خطة ناظم لا تحتوي مسار حفظ أو إتقان صالحًا.', 'NAZEM_PLAN_PRIMARY_INVALID');
  }
  const dailyPages = mapNazemAmountToRuwasi(primary.amount);
  const start = await getRemoteQuranPosition(connection, primary.startSurah, primary.startAyah);
  const end = await getRemoteQuranPosition(connection, primary.endSurah, primary.endAyah);
  const revisionStart = remoteSnapshot.revision
    ? await getRemoteQuranPosition(connection, remoteSnapshot.revision.startSurah, remoteSnapshot.revision.startAyah)
    : null;
  const revisionEnd = remoteSnapshot.revision
    ? await getRemoteQuranPosition(connection, remoteSnapshot.revision.endSurah, remoteSnapshot.revision.endAyah)
    : null;
  const reviewPages = revisionStart && revisionEnd
    ? Math.max(1, Math.abs(Number(revisionEnd.page) - Number(revisionStart.page)) + 1)
    : null;
  let localSnapshot;

  await connection.beginTransaction();
  try {
    const [[lockedPlan]] = await connection.query(
      `SELECT id, student_id AS studentId, status FROM student_quran_plans
       WHERE id = ? LIMIT 1 FOR UPDATE`,
      [link.planId],
    );
    if (lockedPlan?.status !== 'active') {
      throw reviewNazemError('خطة المنصة المرتبطة ليست نشطة.', 'RUWASI_PLAN_INACTIVE');
    }
    await connection.query(
      `DELETE task FROM student_quran_tasks task
       WHERE task.plan_id = ? AND task.task_date >= CURDATE()
         AND task.teacher_completed IS NULL
         AND COALESCE(task.student_status, 'not_done') <> 'done'
         AND NOT EXISTS (
           SELECT 1 FROM student_quran_recitation_attempts attempt
           WHERE attempt.task_id = task.id AND attempt.is_official = 1
         )`,
      [link.planId],
    );
    await connection.query(
      `UPDATE student_quran_plans SET track = ?, start_surah = ?, start_ayah = ?, start_page = ?,
        end_surah = ?, end_ayah = ?, end_page = ?, daily_pages = ?, link_pages = ?,
        review_pages = ?, plan_version = plan_version + 1,
        effective_from = CURDATE(),
        next_memorization_surah = IF(next_memorization_page BETWEEN LEAST(?, ?) AND GREATEST(?, ?),
          next_memorization_surah, ?),
        next_memorization_ayah = IF(next_memorization_page BETWEEN LEAST(?, ?) AND GREATEST(?, ?),
          next_memorization_ayah, ?),
        next_memorization_page = IF(next_memorization_page BETWEEN LEAST(?, ?) AND GREATEST(?, ?),
          next_memorization_page, ?)
       WHERE id = ?`,
      [
        primary.tab === 'الإتقان' ? 'mastery' : 'memorization',
        start.surah, start.ayah, start.page, end.surah, end.ayah, end.page,
        dailyPages, Math.max(0, Number(primary.linkCount ?? 10)), reviewPages ?? 20,
        start.page, end.page, start.page, end.page, start.surah,
        start.page, end.page, start.page, end.page, start.ayah,
        start.page, end.page, start.page, end.page, start.page,
        link.planId,
      ],
    );
    await connection.query(
      'DELETE FROM student_quran_plan_prior_memorization WHERE plan_id = ?',
      [link.planId],
    );
    if (revisionStart && revisionEnd) {
      const ordered = Number(revisionStart.page) < Number(revisionEnd.page)
        || (Number(revisionStart.page) === Number(revisionEnd.page)
          && Number(revisionStart.surah) * 1000 + Number(revisionStart.ayah)
            <= Number(revisionEnd.surah) * 1000 + Number(revisionEnd.ayah))
        ? [revisionStart, revisionEnd]
        : [revisionEnd, revisionStart];
      await connection.query(
        `INSERT INTO student_quran_plan_prior_memorization
          (plan_id, student_id, start_surah, start_ayah, start_page, end_surah, end_ayah, end_page)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [link.planId, lockedPlan.studentId, ordered[0].surah, ordered[0].ayah, ordered[0].page,
          ordered[1].surah, ordered[1].ayah, ordered[1].page],
      );
    }
    const updatedPlan = await loadPlan(connection, link.planId);
    localSnapshot = mapNazemOwnedPlanSnapshot(updatedPlan, remoteSnapshot);
    await connection.query(
      `UPDATE nazem_plan_links SET sync_status = 'synced', local_snapshot = ?, remote_snapshot = ?,
        last_synced_snapshot = ?, last_synced_at = NOW(3), last_remote_checked_at = NOW(3),
        last_error_code = NULL, last_error = NULL WHERE ruwasi_plan_id = ? AND teacher_id = ?`,
      [JSON.stringify(localSnapshot), JSON.stringify(remoteSnapshot),
        JSON.stringify({ local: localSnapshot, remote: remoteSnapshot }), link.planId, teacherId],
    );
    await resolveOpenNazemConflicts(connection, 'plan', link.planId, 'nazem_applied_automatically');
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }

  return localSnapshot;
}

async function loadStudentLink(connection, teacherId, studentId) {
  const [[link]] = await connection.query(
    `SELECT nazem_student_id AS nazemStudentId, nazem_student_name AS nazemStudentName,
      external_organization_id AS externalOrganizationId,
      external_organization_name AS externalOrganizationName,
      external_circle_id AS externalCircleId, external_circle_name AS externalCircleName,
      status
     FROM nazem_student_links WHERE teacher_id = ? AND ruwasi_student_id = ? LIMIT 1`,
    [teacherId, studentId],
  );
  if (link?.status !== 'linked' || !isNazemExternalStudentId(link.nazemStudentId)) {
    throw reviewNazemError('الطالب يحتاج إلى مطابقة مؤكدة مع طالب ناظم.', 'NAZEM_STUDENT_NOT_LINKED');
  }
  return link;
}

async function syncPlan(connection, job) {
  const plan = await loadPlan(connection, job.entityId || job.payload.planId);
  if (plan.status !== 'active') {
    throw reviewNazemError('خطة المنصة لم تعد نشطة؛ راجع الخطة الخارجية يدويًا.', 'RUWASI_PLAN_INACTIVE');
  }
  const studentLink = await loadStudentLink(connection, job.teacherId, plan.studentId);
  const [[planLink]] = await connection.query(
    `SELECT nazem_plan_id AS nazemPlanId, sync_status AS syncStatus
     FROM nazem_plan_links
     WHERE ruwasi_plan_id = ? AND teacher_id = ? AND ruwasi_student_id = ? LIMIT 1`,
    [plan.id, job.teacherId, plan.studentId],
  );
  if (!planLink) {
    throw reviewNazemError('رابط الخطة لا يخص حساب المعلم المحدد.', 'NAZEM_PLAN_TEACHER_MISMATCH');
  }
  const reviewRange = await loadPlanReviewRange(connection, plan);
  const mapped = mapRuwasiPlanBundleToNazem(plan, reviewRange);
  const localSnapshot = { ...mapped, planVersion: plan.planVersion };
  const { adapter } = await openAdapterForTeacher(connection, job.teacherId);
  try {
    await adapter.login();
    let remote;
    if (planLink?.nazemPlanId) {
      remote = await adapter.updatePlan(studentLink, mapped, planLink.nazemPlanId);
    } else {
      remote = await adapter.findPlanBundle(studentLink, mapped);
      if (!remote) remote = await adapter.createPlan(studentLink, mapped);
    }
    const remoteSnapshot = normalizeRemotePlanSnapshot(remote) || {};
    await connection.query(
      `UPDATE nazem_plan_links SET nazem_student_id = ?, nazem_plan_id = ?,
        external_fingerprint = ?, sync_status = 'synced', last_synced_at = NOW(3),
        last_remote_checked_at = NOW(3), last_error_code = NULL, last_error = NULL,
        local_snapshot = ?, remote_snapshot = ?, last_synced_snapshot = ?
       WHERE ruwasi_plan_id = ? AND teacher_id = ?`,
      [
        studentLink.nazemStudentId,
        remote?.externalId || planLink?.nazemPlanId || null,
        snapshotHash(localSnapshot),
        JSON.stringify(localSnapshot),
        JSON.stringify(remoteSnapshot),
        JSON.stringify({ local: localSnapshot, remote: remoteSnapshot }),
        plan.id,
        job.teacherId,
      ],
    );
    await connection.query(
      "UPDATE nazem_accounts SET encrypted_session_state = ?, last_verified_at = NOW(3), status = 'connected' WHERE teacher_id = ?",
      [encryptNazemJson(await adapter.getSessionState()), job.teacherId],
    );
    const queuedRecitations = await enqueueMissingNazemRecitations(connection, job.teacherId, plan.id);
    return {
      planId: plan.id,
      externalPlanId: remote?.externalId || planLink?.nazemPlanId || null,
      queuedRecitations,
    };
  } catch (cause) {
    throw translateAdapterFailure(cause, 'مزامنة الخطة');
  } finally {
    await adapter.close();
  }
}

async function loadRecitation(connection, attemptId) {
  const [[recitation]] = await connection.query(
    `SELECT attempt.id, attempt.request_id AS requestId, attempt.task_id AS taskId,
      DATE_FORMAT(attempt.session_date, '%Y-%m-%d') AS sessionDate,
      attempt.warning_count AS warningCount, attempt.mistake_count AS mistakeCount,
      attempt.evaluation_score AS evaluationScore, attempt.teacher_completed AS teacherCompleted,
      DATE_FORMAT(task.task_date, '%Y-%m-%d') AS taskDate,
      task.task_type AS taskType, task.track, task.plan_id AS planId, task.student_id AS studentId,
      task.from_surah AS fromSurah, task.from_ayah AS fromAyah, task.to_ayah AS toAyah,
      task.to_surah AS toSurah, task.actual_to_surah AS actualToSurah,
      task.actual_to_ayah AS actualToAyah,
      task.scheduled_to_surah AS scheduledToSurah,
      task.scheduled_to_ayah AS scheduledToAyah,
      COALESCE(repeatTask.actual_repeat_count, 0) AS actualRepeatCount,
      COALESCE(repeatTask.actual_listening_count, 0) AS actualListeningCount,
      repeatSetting.setting_value AS plannedRepeatCount,
      listeningSetting.setting_value AS plannedListeningCount,
      COALESCE((
        SELECT SUM(linkMetric.actual_link_count)
        FROM student_quran_tasks linkMetric
        WHERE linkMetric.plan_id = task.plan_id
          AND linkMetric.student_id = task.student_id
          AND linkMetric.task_date = task.task_date
          AND linkMetric.task_type = 'link'
      ), NULL) AS linkCount,
      attendance.status AS attendanceStatus,
      fromSurah.name_arabic AS fromSurahName, toSurah.name_arabic AS toSurahName,
      actualToSurah.name_arabic AS actualToSurahName
     FROM student_quran_recitation_attempts attempt
     JOIN student_quran_tasks task ON task.id = attempt.task_id
     JOIN student_quran_plans plan ON plan.id = task.plan_id
     JOIN quran_surahs fromSurah ON fromSurah.surah_number = task.from_surah
     JOIN quran_surahs toSurah ON toSurah.surah_number = task.to_surah
     LEFT JOIN quran_surahs actualToSurah ON actualToSurah.surah_number = task.actual_to_surah
     LEFT JOIN attendance_records attendance
       ON attendance.student_id = task.student_id AND attendance.record_date = attempt.session_date
     LEFT JOIN student_quran_tasks repeatTask
       ON repeatTask.plan_id = task.plan_id AND repeatTask.student_id = task.student_id
      AND repeatTask.task_date = task.task_date AND repeatTask.task_type = 'repeat'
      AND repeatTask.track = task.track
      AND repeatTask.from_page = task.from_page AND repeatTask.to_page = task.to_page
     LEFT JOIN app_settings repeatSetting
       ON repeatSetting.setting_key = IF(task.track = 'mastery', 'masteryRepeatCount', 'memorizationRepeatCount')
     LEFT JOIN app_settings listeningSetting
       ON listeningSetting.setting_key = IF(task.track = 'mastery', 'masteryListeningCount', 'memorizationListeningCount')
     WHERE attempt.id = ? LIMIT 1`,
    [attemptId],
  );
  if (!recitation) throw reviewNazemError('سجل تسميع المنصة غير موجود.', 'RUWASI_RECITATION_NOT_FOUND');
  return recitation;
}

async function loadDailyFollowUp(connection, dailyFollowUpId) {
  const [[daily]] = await connection.query(
    `SELECT daily.id, daily.ruwasi_plan_id AS planId,
      daily.ruwasi_student_id AS studentId, daily.teacher_id AS teacherId,
      DATE_FORMAT(daily.follow_up_date, '%Y-%m-%d') AS taskDate,
      daily.task_type AS taskType, daily.track, daily.sync_status AS syncStatus,
      daily.remote_snapshot AS remoteSnapshot, daily.local_snapshot AS localSnapshot
     FROM nazem_daily_follow_up_links daily
     WHERE daily.id = ? LIMIT 1`,
    [dailyFollowUpId],
  );
  if (!daily) {
    throw reviewNazemError('سجل المتابعة اليومية المجمّع في المنصة غير موجود.', 'RUWASI_DAILY_FOLLOW_UP_NOT_FOUND');
  }
  const [recitations] = await connection.query(
    `SELECT attempt.id, attempt.request_id AS requestId, attempt.task_id AS taskId,
      receipt.remote_snapshot AS deliverySnapshot, receipt.sync_status AS deliveryStatus,
      DATE_FORMAT(attempt.session_date, '%Y-%m-%d') AS sessionDate,
      attempt.warning_count AS warningCount, attempt.mistake_count AS mistakeCount,
      attempt.evaluation_score AS evaluationScore, attempt.teacher_completed AS teacherCompleted,
      DATE_FORMAT(task.task_date, '%Y-%m-%d') AS taskDate,
      task.task_type AS taskType, task.track, task.plan_id AS planId, task.student_id AS studentId,
      task.from_page AS fromPage, task.to_page AS toPage,
      task.from_surah AS fromSurah, task.from_ayah AS fromAyah,
      task.to_surah AS toSurah, task.to_ayah AS toAyah,
      task.scheduled_to_surah AS scheduledToSurah,
      task.scheduled_to_ayah AS scheduledToAyah,
      task.actual_to_page AS actualToPage, task.actual_to_surah AS actualToSurah,
      task.actual_to_ayah AS actualToAyah,
      plan.start_page AS planStartPage, plan.end_page AS planEndPage,
      COALESCE(repeatTask.actual_repeat_count, 0) AS actualRepeatCount,
      COALESCE(repeatTask.actual_listening_count, 0) AS actualListeningCount,
      repeatSetting.setting_value AS plannedRepeatCount,
      listeningSetting.setting_value AS plannedListeningCount,
      COALESCE((
        SELECT SUM(linkMetric.actual_link_count)
        FROM student_quran_tasks linkMetric
        WHERE linkMetric.plan_id = task.plan_id
          AND linkMetric.student_id = task.student_id
          AND linkMetric.task_date = task.task_date
          AND linkMetric.task_type = 'link'
      ), NULL) AS linkCount,
      attendance.status AS attendanceStatus,
      fromSurah.name_arabic AS fromSurahName, toSurah.name_arabic AS toSurahName,
      actualToSurah.name_arabic AS actualToSurahName
     FROM student_quran_recitation_attempts attempt
     JOIN student_quran_tasks task ON task.id = attempt.task_id
     LEFT JOIN nazem_recitation_links receipt ON receipt.ruwasi_recitation_id = attempt.id
     JOIN student_quran_plans plan ON plan.id = task.plan_id
     JOIN quran_surahs fromSurah ON fromSurah.surah_number = task.from_surah
     JOIN quran_surahs toSurah ON toSurah.surah_number = task.to_surah
     LEFT JOIN quran_surahs actualToSurah ON actualToSurah.surah_number = task.actual_to_surah
     LEFT JOIN attendance_records attendance
       ON attendance.student_id = task.student_id AND attendance.record_date = attempt.session_date
     LEFT JOIN student_quran_tasks repeatTask
       ON repeatTask.plan_id = task.plan_id AND repeatTask.student_id = task.student_id
      AND repeatTask.task_date = task.task_date AND repeatTask.task_type = 'repeat'
      AND repeatTask.track = task.track
      AND repeatTask.from_page = task.from_page AND repeatTask.to_page = task.to_page
      AND COALESCE(repeatTask.from_surah, 0) = COALESCE(task.from_surah, 0)
      AND COALESCE(repeatTask.from_ayah, 0) = COALESCE(task.from_ayah, 0)
      AND COALESCE(repeatTask.to_surah, 0) = COALESCE(task.to_surah, 0)
      AND COALESCE(repeatTask.to_ayah, 0) = COALESCE(task.to_ayah, 0)
     LEFT JOIN app_settings repeatSetting
       ON repeatSetting.setting_key = IF(task.track = 'mastery', 'masteryRepeatCount', 'memorizationRepeatCount')
     LEFT JOIN app_settings listeningSetting
       ON listeningSetting.setting_key = IF(task.track = 'mastery', 'masteryListeningCount', 'memorizationListeningCount')
     WHERE attempt.is_official = 1
       AND NOT EXISTS (
         SELECT 1 FROM student_quran_recitation_attempts newer
         WHERE newer.task_id = attempt.task_id AND newer.is_official = 1
           AND (newer.attempt_number > attempt.attempt_number
             OR (newer.attempt_number = attempt.attempt_number AND newer.id > attempt.id))
       )
       AND task.plan_id = ? AND task.student_id = ?
       AND task.task_date = ? AND task.task_type = ? AND task.track = ?
       AND (task.task_type <> 'review' OR task.nazem_review_id = ?)
     ORDER BY task.from_page, task.from_surah, task.from_ayah, attempt.id`,
    [daily.planId, daily.studentId, daily.taskDate, daily.taskType, daily.track, daily.id],
  );
  if (!recitations.length) {
    throw reviewNazemError('لا توجد محاولات رسمية ضمن متابعة اليوم المجمعة.', 'RUWASI_DAILY_ATTEMPTS_NOT_FOUND');
  }
  return { daily, recitations };
}

async function syncRecitation(connection, job) {
  const dailyFollowUpId = Number(job.payload?.dailyFollowUpId || (job.entityType === 'recitation_day' ? job.entityId : 0));
  const grouped = dailyFollowUpId ? await loadDailyFollowUp(connection, dailyFollowUpId) : null;
  const recitations = grouped?.recitations || [await loadRecitation(connection, job.entityId || job.payload.attemptId)];
  const recitation = recitations[0];
  const studentLink = await loadStudentLink(connection, job.teacherId, recitation.studentId);
  let [[planLink]] = await connection.query(
    `SELECT nazem_plan_id AS nazemPlanId, sync_status AS syncStatus
     FROM nazem_plan_links
     WHERE ruwasi_plan_id = ? AND teacher_id = ? AND ruwasi_student_id = ? LIMIT 1`,
    [recitation.planId, job.teacherId, recitation.studentId],
  );
  planLink = await restoreImportedNazemPlanLink(connection, {
    teacherId: job.teacherId,
    studentId: recitation.studentId,
    planId: recitation.planId,
    planLink,
  });
  if (planLink && ['pending', 'syncing', 'retrying'].includes(String(planLink.syncStatus || ''))) {
    throw transientNazemError(
      'ستُرسل المتابعة اليومية بعد اكتمال مزامنة خطة الطالب مع ناظم.',
      'NAZEM_PLAN_SYNC_PENDING',
    );
  }
  if (planLink?.syncStatus !== 'synced') {
    throw reviewNazemError('يجب مزامنة خطة الطالب مع ناظم قبل التسميع.', 'NAZEM_PLAN_NOT_SYNCED');
  }
  const verificationOnly = !job.payload?.submissionTarget;
  const submissionTarget = job.payload?.submissionTarget || await resolveLegacyRecitationTarget(connection, {
    daily: grouped?.daily, recitations, studentLink, planLink, attemptId: job.payload?.attemptId,
  });
  const remoteSource = validateRecitationTarget(submissionTarget, recitations, studentLink, planLink);
  const frozenRecitations = recitations.map(item => ({ ...item,
    scheduledToSurah: Number(remoteSource.surah_to) || item.scheduledToSurah,
    scheduledToAyah: Number(remoteSource.verse_to) || item.scheduledToAyah,
  }));
  const mapped = grouped
    ? mapRuwasiRecitationGroupToNazem(frozenRecitations)
    : mapRuwasiRecitationToNazem(frozenRecitations[0]);
  attachRecitationSourceIdentity(remoteSource, mapped);
  if (dailyFollowUpId) {
    await connection.query(
      `UPDATE nazem_daily_follow_up_links SET local_snapshot = ?, last_error_code = NULL, last_error = NULL
       WHERE id = ? AND teacher_id = ?`,
      [JSON.stringify(mapped), dailyFollowUpId, job.teacherId],
    );
    await connection.query(
      `UPDATE nazem_recitation_links SET local_snapshot = ?, last_error_code = NULL, last_error = NULL
       WHERE daily_follow_up_id = ? AND teacher_id = ?`,
      [JSON.stringify(mapped), dailyFollowUpId, job.teacherId],
    );
  } else {
    await connection.query(
      `UPDATE nazem_recitation_links SET local_snapshot = ?, last_error_code = NULL, last_error = NULL
       WHERE ruwasi_recitation_id = ? AND teacher_id = ?`,
      [JSON.stringify(mapped), recitation.id, job.teacherId],
    );
  }
  const { adapter } = await openAdapterForTeacher(connection, job.teacherId);
  adapter.recitationJournal = recitationWriteJournal(connection, job);
  if (verificationOnly) adapter.recitationJournal.before = async () => {
    throw reviewNazemError('هذا تقييم سابق لا يملك إيصال إرسال موثقًا. يلزم مطابقة وصوله قبل إعادة الإرسال.', 'NAZEM_DELIVERY_UNVERIFIED');
  };
  try {
    if (!verificationOnly) await recoverRejectedRecitationWrite(connection, job);
    applyRecitationWriteIdentity(mapped, job, verificationOnly);
    await adapter.login();
    await persistNazemSession(connection, job.teacherId, adapter);
    const remote = await submitWithNazemAuthority({
      adapter, studentLink, planLink, mapped,
      applyAttendance: (attendance) => applyRemoteAttendanceToRuwasi(connection, recitation.studentId, attendance),
      importDay: async (day) => {
        const link = { teacherId: job.teacherId, studentId: recitation.studentId, planId: recitation.planId };
        await connection.beginTransaction();
        try {
          await syncNazemScheduledTaskRange(connection, link, day, { inTransaction: true });
          const result = await saveRemoteFollowUp(connection, link, day);
          if (result.synced) await connection.commit();
          else await connection.rollback();
          return result;
        } catch (error) {
          await connection.rollback();
          throw error;
        }
      },
    });
    await persistNazemSession(connection, job.teacherId, adapter);
    if (remote.authoritative) {
      await connection.query(
        `UPDATE nazem_recitation_links SET sync_status = 'synced', last_synced_at = NOW(3),
          last_error_code = NULL, last_error = NULL
         WHERE teacher_id = ? AND ruwasi_recitation_id IN (?)`,
        [job.teacherId, recitations.map((attempt) => attempt.id)],
      );
      await resolveOpenNazemConflicts(connection, job.entityType, job.entityId, 'nazem_applied_automatically');
      const nextTaskRefresh = await refreshStudentFollowUpsAfterRecitation(connection, {
        adapter, teacherId: job.teacherId, studentId: recitation.studentId, planId: recitation.planId,
        nazemPlanId: planLink.nazemPlanId, studentLink,
      });
      const nextRecitationJobId = await wakeNextBlockedNazemRecitation(connection, job);
      return { ...remote, nextTaskRefresh, nextRecitationJobId };
    }
    if (dailyFollowUpId) {
      await connection.query(
        `UPDATE nazem_daily_follow_up_links SET nazem_record_id = ?, sync_status = 'synced',
          last_synced_at = NOW(3), last_remote_checked_at = NOW(3),
          last_error_code = NULL, last_error = NULL, local_snapshot = ?
         WHERE id = ? AND teacher_id = ?`,
        [remote?.externalId || null, JSON.stringify(mapped), dailyFollowUpId, job.teacherId],
      );
      await connection.query(
        `UPDATE nazem_recitation_links SET sync_status = 'synced', last_synced_at = NOW(3),
          last_error_code = NULL, last_error = NULL, local_snapshot = ?, remote_snapshot = ?
         WHERE daily_follow_up_id = ? AND teacher_id = ? AND ruwasi_recitation_id IN (?)`,
        [JSON.stringify(mapped), JSON.stringify(remote || {}), dailyFollowUpId, job.teacherId,
          recitations.map(attempt => attempt.id)],
      );
      await resolveOpenNazemConflicts(
        connection,
        'recitation_day',
        dailyFollowUpId,
        'matched_after_ruwasi_sync',
      );
      const nextTaskRefresh = await refreshStudentFollowUpsAfterRecitation(connection, {
        adapter,
        teacherId: job.teacherId,
        studentId: recitation.studentId,
        planId: recitation.planId,
        nazemPlanId: planLink.nazemPlanId,
        studentLink,
      });
      await persistNazemSession(connection, job.teacherId, adapter);
      const nextRecitationJobId = await wakeNextBlockedNazemRecitation(connection, job);
      return {
        dailyFollowUpId,
        attemptIds: mapped.attemptIds,
        externalRecordId: remote?.externalId || null,
        nextTaskRefresh,
        nextRecitationJobId,
      };
    }
    await connection.query(
      `UPDATE nazem_recitation_links SET nazem_record_id = ?, sync_status = 'synced',
        last_synced_at = NOW(3), last_error_code = NULL, last_error = NULL,
        local_snapshot = ?, remote_snapshot = ?
       WHERE ruwasi_recitation_id = ? AND teacher_id = ?`,
      [remote?.externalId || null, JSON.stringify(mapped), JSON.stringify(remote || {}), recitation.id, job.teacherId],
    );
    const nextTaskRefresh = await refreshStudentFollowUpsAfterRecitation(connection, {
      adapter,
      teacherId: job.teacherId,
      studentId: recitation.studentId,
      planId: recitation.planId,
      nazemPlanId: planLink.nazemPlanId,
      studentLink,
    });
    await persistNazemSession(connection, job.teacherId, adapter);
    const nextRecitationJobId = await wakeNextBlockedNazemRecitation(connection, job);
    return {
      recitationId: recitation.id,
      externalRecordId: remote?.externalId || null,
      nextTaskRefresh,
      nextRecitationJobId,
    };
  } catch (cause) {
    throw translateAdapterFailure(cause, 'إرسال التسميع');
  } finally {
    await adapter.close();
  }
}

/** Keep the saved remote day and late-record identity attached to the outgoing snapshot. */
function attachRecitationSourceIdentity(remoteSource, mapped) {
  if (remoteSource) {
    mapped.nazemLateId = remoteSource.nazemLate ? remoteSource.id : null;
    mapped.nazemSourceDayId = remoteSource.source_day_id || (!remoteSource.nazemLate ? remoteSource.id : null);
    mapped.nazemSavedTarget = remoteSource;
  }
}

async function refreshStudentFollowUpsAfterRecitation(connection, {
  adapter,
  teacherId,
  studentId,
  planId,
  nazemPlanId,
  studentLink,
}) {
  try {
    const history = await adapter.readStudentFollowUpHistory(nazemPlanId, studentLink, 1);
    const link = { teacherId, studentId, planId, nazemPlanId };
    let scheduled = 0;
    let finalized = 0;
    for (const day of history.scheduledFollowUps || []) {
      const result = await syncNazemScheduledTaskRange(connection, link, day);
      if (result.matched) scheduled += 1;
    }
    for (const day of [...(history.followUps || [])]
      .sort((first, second) => String(first.date).localeCompare(String(second.date)))) {
      await syncNazemScheduledTaskRange(connection, link, day);
      await importRemoteFollowUpTransaction(connection, link, day);
      finalized += 1;
    }
    return { status: 'synced', scheduled, finalized };
  } catch (error) {
    return {
      status: 'deferred',
      errorCode: String(error?.code || 'NAZEM_FOLLOW_UP_REFRESH_FAILED').slice(0, 100),
      error: String(error?.message || 'تعذر تحديث المقدار التالي.').slice(0, 500),
    };
  }
}

async function wakeNextBlockedNazemRecitation(connection, job) {
  await reconcileConfirmedRecitationJobs(connection, job.teacherId);
  const [[active]] = await connection.query(
    `SELECT id FROM nazem_sync_jobs
     WHERE teacher_id = ? AND student_id = ? AND operation_type = 'recitation.submit'
       AND id <> ? AND status IN ('pending','retrying','syncing')
     LIMIT 1`,
    [job.teacherId, job.studentId, job.id],
  );
  if (active) return null;
  const [[next]] = await connection.query(
    `SELECT id FROM nazem_sync_jobs
     WHERE teacher_id = ? AND student_id = ? AND operation_type = 'recitation.submit'
       AND id <> ? AND status IN ('blocked','conflict','requires_review')
       AND last_error_code IN ('NAZEM_PREVIOUS_DAYS_BLOCKING','NAZEM_RECITATION_START_CONFLICT','NAZEM_LINK_WAITING_FOR_MEMORIZATION')
     ORDER BY JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.taskDate')), id
     LIMIT 1`,
    [job.teacherId, job.studentId, job.id],
  );
  if (!next) return null;
  await connection.query(
    `UPDATE nazem_sync_jobs SET status = 'pending', max_attempts = GREATEST(max_attempts, attempt_count + 2),
      next_attempt_at = NOW(3), lease_owner = NULL, lease_expires_at = NULL,
      last_heartbeat_at = NULL
     WHERE id = ?`,
    [next.id],
  );
  return Number(next.id);
}

async function syncAttendance(connection, job) {
  const { studentId, planId, nazemPlanId, date, status } = job.payload || {};
  const attendanceStatus = mapRuwasiAttendanceStatusToNazem(status);
  if (!attendanceStatus) {
    throw reviewNazemError('حالة حضور المنصة غير مدعومة في ناظم.', 'RUWASI_ATTENDANCE_STATUS_UNSUPPORTED');
  }
  const studentLink = await loadStudentLink(connection, job.teacherId, Number(studentId));
  const [[planLink]] = await connection.query(
    `SELECT nazem_plan_id AS nazemPlanId, sync_status AS syncStatus
     FROM nazem_plan_links
     WHERE teacher_id = ? AND ruwasi_student_id = ?
     ORDER BY (sync_status = 'synced') DESC, (ruwasi_plan_id = ?) DESC, id DESC LIMIT 1`,
    [job.teacherId, studentId, planId || 0],
  );
  const _resolveTargetPlan = () => {
    if (planLink?.syncStatus === 'synced') {
      return planLink;
    }
    if (nazemPlanId) {
      return { nazemPlanId: String(nazemPlanId), syncStatus: 'discovered' };
    }
    return null;
  };
  let targetPlan = _resolveTargetPlan();
  if (!targetPlan?.nazemPlanId) {
    const [[candidate]] = await connection.query(
      `SELECT nazem_plan_id AS nazemPlanId
       FROM nazem_plan_candidates
       WHERE teacher_id = ? AND ruwasi_student_id = ?
         AND discovery_status IN ('discovered','requires_review','imported')
         AND nazem_plan_id IS NOT NULL
       ORDER BY updated_at DESC, id DESC LIMIT 1`,
      [job.teacherId, studentId],
    );
    if (candidate?.nazemPlanId) targetPlan = { ...candidate, syncStatus: 'discovered' };
  }
  if (!targetPlan?.nazemPlanId) {
    throw reviewNazemError('يجب ربط الطالب بمجموعة خطة في ناظم قبل إرسال حضوره.', 'NAZEM_PLAN_NOT_SYNCED');
  }
  const { adapter } = await openAdapterForTeacher(connection, job.teacherId);
  try {
    await adapter.login();
    await persistNazemSession(connection, job.teacherId, adapter);
    const remote = await adapter.submitAttendance(studentLink, targetPlan, { date, attendanceStatus, explicitChange: job.payload?.explicitChange === true });
    await applyRemoteAttendanceToRuwasi(connection, Number(studentId), { date, attendanceStatus: remote.attendanceStatus, activeJobId: job.id });
    await persistNazemSession(connection, job.teacherId, adapter);
    return remote;
  } catch (cause) {
    throw translateAdapterFailure(cause, 'إرسال الحضور');
  } finally {
    await adapter.close();
  }
}

export async function enqueueMissingNazemRecitations(connection, teacherId, planId = null) {
  let enqueued = 0;
  for (let batch = 0; batch < 10; batch += 1) {
    const [attempts] = await connection.query(
      `SELECT attempt.id AS attemptId, task.id, task.plan_id AS planId,
        task.task_type AS taskType, task.track,
        task.student_id AS studentId, DATE_FORMAT(task.task_date, '%Y-%m-%d') AS taskDate,
        DATE_FORMAT(attempt.session_date, '%Y-%m-%d') AS sessionDate
       FROM student_quran_recitation_attempts attempt
       JOIN student_quran_tasks task ON task.id = attempt.task_id
       JOIN nazem_plan_links planLink ON planLink.ruwasi_plan_id = task.plan_id
         AND planLink.teacher_id = ? AND planLink.sync_status = 'synced'
       JOIN nazem_student_links studentLink ON studentLink.teacher_id = ?
         AND studentLink.ruwasi_student_id = task.student_id AND studentLink.status = 'linked'
       LEFT JOIN nazem_recitation_links recitationLink
         ON recitationLink.ruwasi_recitation_id = attempt.id
        AND recitationLink.teacher_id = ?
       LEFT JOIN nazem_daily_follow_up_links recitationDay
         ON recitationDay.id = recitationLink.daily_follow_up_id
       WHERE attempt.is_official = 1
         AND task.task_type IN ('memorization', 'review', 'link')
         AND (? IS NULL OR task.plan_id = ?)
         AND (
           recitationLink.id IS NULL
           OR recitationLink.sync_status = 'pending'
           OR (
             recitationLink.sync_status = 'synced'
             AND (
               (attempt.teacher_completed = 1 AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(recitationLink.remote_snapshot, '$.status')), '')
                 NOT IN ('completed','partial','completed_early','partial_early','completed_late'))
             )
           )
           OR (
             recitationLink.sync_status IN ('failed','blocked','requires_review')
             AND recitationLink.last_error_code IN ('NAZEM_PLAN_NOT_SYNCED','NAZEM_PLAN_SYNC_PENDING')
           )
           OR (
             recitationLink.sync_status = 'conflict'
             AND attempt.teacher_completed = 1
             AND COALESCE(
               JSON_UNQUOTE(JSON_EXTRACT(recitationLink.remote_snapshot, '$.status')),
               JSON_UNQUOTE(JSON_EXTRACT(recitationDay.remote_snapshot, '$.status')),
               ''
             )
               NOT IN ('completed','partial','completed_early','partial_early','completed_late')
           )
         )
       ORDER BY attempt.session_date, attempt.id
       LIMIT 100`,
      [teacherId, teacherId, teacherId, planId, planId],
    );
    if (!attempts.length) break;
    let batchEnqueued = 0;
    for (const attempt of attempts) {
      const jobId = await enqueueNazemRecitation(connection, {
        attemptId: attempt.attemptId,
        task: attempt,
        actor: { role: 'supervisor', id: teacherId },
      });
      if (jobId) {
        enqueued += 1;
        batchEnqueued += 1;
      }
    }
    if (!batchEnqueued || attempts.length < 100) break;
  }
  return enqueued;
}

const remoteFollowUpCompleted = (day) => isNazemFollowUpCompleted(day?.status);

const compareNazemTaskPosition = (first, second, direction = 1) => {
  const values = [
    Number(first?.page || 0) - Number(second?.page || 0),
    Number(first?.surah || 0) - Number(second?.surah || 0),
    Number(first?.ayah || 0) - Number(second?.ayah || 0),
  ];
  return (values.find((value) => value !== 0) || 0) * direction;
};

async function advanceNazemMemorizationCursor(connection, {
  planId,
  planEnd,
  actualEnd,
  direction,
}) {
  if (!planId || !actualEnd || !planEnd) return;
  const completedPlan = compareNazemTaskPosition(actualEnd, planEnd, direction) >= 0;
  let next = null;
  if (!completedPlan) {
    const operator = direction < 0 ? '<' : '>';
    const order = direction < 0 ? 'DESC' : 'ASC';
    [[next]] = await connection.query(
      `SELECT page_number AS page, surah_number AS surah, ayah_number AS ayah
       FROM quran_ayah_pages
       WHERE page_number ${operator} ?
          OR (page_number = ? AND surah_number ${operator} ?)
          OR (page_number = ? AND surah_number = ? AND ayah_number ${operator} ?)
       ORDER BY page_number ${order}, surah_number ${order}, ayah_number ${order}
       LIMIT 1`,
      [actualEnd.page, actualEnd.page, actualEnd.surah,
        actualEnd.page, actualEnd.surah, actualEnd.ayah],
    );
  }
  await connection.query(
    `UPDATE student_quran_plans SET next_memorization_page = ?,
      next_memorization_surah = ?, next_memorization_ayah = ?,
      status = CASE WHEN ? AND NOT EXISTS (
        SELECT 1 FROM student_quran_tasks secondaryTask
        WHERE secondaryTask.plan_id = student_quran_plans.id
          AND secondaryTask.task_type = 'memorization'
          AND secondaryTask.track <> student_quran_plans.track
          AND COALESCE(secondaryTask.teacher_completed, 0) = 0
      ) THEN 'completed' ELSE status END
     WHERE id = ?`,
    [next?.page || Number(planEnd.page) + direction, next?.surah || null, next?.ayah || null,
      completedPlan ? 1 : 0, planId],
  );
}

const remoteFollowUpMatchesLocal = (day, local = {}) => {
  const expectedId = local.nazemLateId || local.nazemSourceDayId;
  if (expectedId && String(day.id) !== String(expectedId)) return false;
  if (local.date && String(day.date || '').slice(0, 10) !== local.date) return false;
  const _resolveRequiredMetrics = () => {
    if (local.remoteType === 'conserve') {
      return ['mistake', 'hearing', 'repetition'];
    }
    if (local.remoteType === 'revision') {
      return ['mistake', 'tune'];
    }
    return [];
  };
  const requiredMetrics = _resolveRequiredMetrics();
  if (requiredMetrics.some(key => !Object.hasOwn(day, key))) return false;
  if (local.linkCount != null && local.remoteType === 'conserve' && !Object.hasOwn(day, 'link')) return false;
  if (remoteFollowUpCompleted(day) !== Boolean(local.completed)) return false;
  if (
    Number(day.surah_from) !== Number(local.fromSurahId)
    || Number(day.verse_from) !== Number(local.fromAyah)
    || Number(day.surah_to) !== Number(local.scheduledToSurahId)
    || Number(day.verse_to) !== Number(local.scheduledToAyah)
  ) return false;
  if (remoteFollowUpCompleted(day) && (
    Number(day.actual_surah_to) !== Number(local.toSurahId)
    || Number(day.actual_verse_to) !== Number(local.toAyah)
  )) return false;
  const hasRemoteErrors = Object.hasOwn(day || {}, 'mistake') || Object.hasOwn(day || {}, 'tune');
  if (local.remoteType !== 'master' && hasRemoteErrors && nazemRemoteErrorCount(day) !== Number(local.mistakeCount || 0)) return false;
  if (!nazemFollowUpMetricsMatch(day, local)) return false;
  return local.attendanceStatus == null
    || day.attendanceStatus == null
    || Number(day.attendanceStatus) === Number(local.attendanceStatus);
};

async function saveRemoteFollowUp(connection, link, day) {
  const track = nazemTaskTrack(day);
  const [dailyResult] = await connection.query(
    `INSERT INTO nazem_daily_follow_up_links
      (ruwasi_plan_id, ruwasi_student_id, teacher_id, follow_up_date, task_type, track,
       nazem_record_id, sync_status, last_remote_checked_at, remote_snapshot)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NOW(3), ?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), nazem_record_id = IF(local_snapshot IS NULL, VALUES(nazem_record_id), nazem_record_id),
       last_remote_checked_at = NOW(3), remote_snapshot = ${latestNazemScheduleSql}`,
    [link.planId, link.studentId, link.teacherId, day.date, day.taskType, track, String(day.id), JSON.stringify(day)],
  );
  const dailyFollowUpId = Number(dailyResult.insertId || 0);
  const [[daily]] = await connection.query(
    `SELECT id, sync_status AS syncStatus, local_snapshot AS localSnapshot, remote_snapshot AS remoteSnapshot,
      EXISTS(
        SELECT 1 FROM nazem_recitation_links recitationLink
        WHERE recitationLink.daily_follow_up_id = nazem_daily_follow_up_links.id
          AND recitationLink.sync_status = 'pending'
      ) AS hasPendingRecitation
     FROM nazem_daily_follow_up_links WHERE id = ? FOR UPDATE`,
    [dailyFollowUpId],
  );
  let local = safeJson(daily?.localSnapshot, null);
  if (preservesPendingNazemLate(safeJson(daily?.remoteSnapshot, null), day)) {
    return { synced: 0, conflicts: 0, imported: 0 };
  }
  let existingGrouped = null;
  try {
    existingGrouped = await loadDailyFollowUp(connection, dailyFollowUpId);
  } catch (error) {
    if (error?.code !== 'RUWASI_DAILY_ATTEMPTS_NOT_FOUND') throw error;
  }
  const reconcileExistingRemoteFollowUpResult = await reconcileExistingRemoteFollowUp({ existingGrouped, local, day, connection, dailyFollowUpId, link });
    if (reconcileExistingRemoteFollowUpResult) { return reconcileExistingRemoteFollowUpResult; }
      const [tasks] = await connection.query(
    `SELECT task.id, task.track, task.target_pages AS targetPages, task.from_page AS fromPage, task.to_page AS toPage,
      task.from_surah AS fromSurah, task.from_ayah AS fromAyah,
      task.to_surah AS toSurah, task.to_ayah AS toAyah,
      plan.start_page AS planStartPage, plan.end_page AS planEndPage,
      plan.end_surah AS planEndSurah, plan.end_ayah AS planEndAyah, plan.track AS planTrack
     FROM student_quran_tasks task
     JOIN student_quran_plans plan ON plan.id = task.plan_id
     WHERE task.plan_id = ? AND task.student_id = ? AND task.task_date = ? AND task.task_type = ? AND task.track = ?
     ORDER BY IF(plan.start_page > plan.end_page, -task.from_page, task.from_page),
       IF(plan.start_page > plan.end_page, -task.from_surah, task.from_surah),
       IF(plan.start_page > plan.end_page, -task.from_ayah, task.from_ayah)
     FOR UPDATE`,
    [link.planId, link.studentId, day.date, day.taskType, track],
  );
  const first = tasks[0];
  const last = tasks.at(-1);
  const exactRange = first && last
    && Number(first.fromSurah) === Number(day.surah_from)
    && Number(first.fromAyah) === Number(day.verse_from)
    && Number(last.toSurah) === Number(day.surah_to)
    && Number(last.toAyah) === Number(day.verse_to);
  if (!exactRange) {
    await connection.query(
      `UPDATE nazem_daily_follow_up_links SET sync_status = 'requires_review',
        last_error_code = 'NAZEM_REMOTE_DAILY_RANGE_UNMATCHED',
        last_error = 'ورد ناظم اليومي لا يطابق مهام المنصة في التاريخ نفسه.' WHERE id = ?`,
      [dailyFollowUpId],
    );
    return { synced: 0, conflicts: 0, imported: 0, review: 1, issueCode: 'NAZEM_REMOTE_DAILY_RANGE_UNMATCHED' };
  }

  const attendanceStatus = { 2: 'present', 3: 'absent', 4: 'excused', 5: 'late' }[Number(day.attendanceStatus)];
  if (attendanceStatus) {
    await applyRemoteAttendanceForImport(connection, link.studentId, {
      date: day.date,
      attendanceStatus: day.attendanceStatus,
    }, true);
  }
  const completed = remoteFollowUpCompleted(day);
  const totalErrors = nazemRemoteErrorCount(day);
  const rewardSettings = await loadRecitationRewardSettings(connection);
  const [[remoteActual]] = completed
    ? await connection.query(
      `SELECT page_number AS page, surah_number AS surah, ayah_number AS ayah
       FROM quran_ayah_pages WHERE surah_number = ? AND ayah_number = ? LIMIT 1`,
      [Number(day.actual_surah_to || day.surah_to), Number(day.actual_verse_to || day.verse_to)],
    )
    : [[null]];
  const direction = Number(first.planStartPage) > Number(first.planEndPage) ? -1 : 1;
  const authoritativeEnd = remoteActual || {
    page: Number(last.toPage),
    surah: Number(day.actual_surah_to || day.surah_to),
    ayah: Number(day.actual_verse_to || day.verse_to),
  };
  const taskPlaceholders = tasks.map(() => '?').join(',');
  await connection.query(
    `DELETE FROM student_quran_task_ayah_marks WHERE task_id IN (${taskPlaceholders})`,
    tasks.map((task) => task.id),
  );
  await connection.query(
    `DELETE FROM student_quran_task_word_marks WHERE task_id IN (${taskPlaceholders})`,
    tasks.map((task) => task.id),
  );
  await connection.query(
    `UPDATE nazem_sync_jobs SET status = 'dismissed', lease_owner = NULL, lease_expires_at = NULL,
      last_error_code = 'NAZEM_REMOTE_AUTHORITATIVE',
      last_error = 'اعتمدت متابعة ناظم الأحدث لهذا اليوم.'
     WHERE operation_type = 'recitation.submit' AND entity_type = 'recitation_day'
       AND entity_id = ? AND status IN ('pending','retrying','failed','blocked','requires_review','conflict')`,
    [dailyFollowUpId],
  );
  const attemptIds = [];
  await persistRemoteTaskAttempts({ tasks, completed, authoritativeEnd, direction, totalErrors, rewardSettings, day, track, connection, link, attemptIds, dailyFollowUpId });
  let importedRepeatCount = 0;
  let importedListeningCount = 0;
  let importedLinkCount = 0;
  ({ importedRepeatCount, importedListeningCount, importedLinkCount } = await saveRemoteMemorizationCounts({ day, importedRepeatCount, completed, importedListeningCount, importedLinkCount, connection, link, track, first }));
  if (completed && day.taskType === 'memorization' && track === first.planTrack) {
    await advanceNazemMemorizationCursor(connection, {
      planId: link.planId,
      planEnd: { page: first.planEndPage, surah: first.planEndSurah, ayah: first.planEndAyah },
      actualEnd: authoritativeEnd,
      direction,
    });
  }
  const importedSnapshot = {
    taskType: day.taskType,
    remoteType: day.remoteType,
    completed,
    mistakeCount: totalErrors,
    warningCount: 0,
    date: day.date,
    attendanceStatus: Number(day.attendanceStatus),
    fromSurahId: Number(day.surah_from),
    fromAyah: Number(day.verse_from),
    scheduledToSurahId: Number(day.surah_to),
    scheduledToAyah: Number(day.verse_to),
    toSurahId: Number(day.actual_surah_to || day.surah_to),
    toAyah: Number(day.actual_verse_to || day.verse_to),
    taskIds: tasks.map((task) => Number(task.id)),
    attemptIds,
    repeatCount: importedRepeatCount,
    listeningCount: importedListeningCount,
    linkCount: importedLinkCount,
    importedFromNazem: true,
  };
  await connection.query(
    `UPDATE nazem_daily_follow_up_links SET sync_status = 'synced', local_snapshot = ?,
      remote_snapshot = ?, last_synced_at = NOW(3), last_remote_checked_at = NOW(3),
      last_error_code = NULL, last_error = NULL WHERE id = ?`,
    [JSON.stringify(importedSnapshot), JSON.stringify(day), dailyFollowUpId],
  );
  await resolveOpenNazemConflicts(connection, 'recitation_day', dailyFollowUpId, 'nazem_applied_automatically');
  await importNazemLinkResult(connection, link, day, dailyFollowUpId);
  await enqueueNazemPointReconciliation(connection, dailyFollowUpId, day);
  await reconcileConfirmedRecitationJobs(connection, link.teacherId);
  return { synced: 1, conflicts: 0, imported: 1 };
}



/** Import repetition, listening and link counts without replacing an independently recorded link count. */
async function saveRemoteMemorizationCounts({ day, importedRepeatCount, completed, importedListeningCount, importedLinkCount, connection, link, track, first }) {
  if (day.taskType !== 'memorization') { return { importedRepeatCount, importedListeningCount, importedLinkCount }; }

    importedRepeatCount = completed
      ? Math.min(30, Math.max(0, Math.trunc(Number(day.repetition || 0))))
      : 0;
    importedListeningCount = completed && Number(day.hearing) === 1 ? 1 : 0;
    importedLinkCount = completed ? normalizeNazemLinkCount(day.link) : 0;
    await connection.query(
      `UPDATE student_quran_tasks
       SET student_status = ?,
           actual_to_page = CASE WHEN ? = 1 THEN to_page ELSE NULL END,
           actual_to_surah = CASE WHEN ? = 1 THEN to_surah ELSE NULL END,
           actual_to_ayah = CASE WHEN ? = 1 THEN to_ayah ELSE NULL END,
           actual_repeat_count = ?, actual_listening_count = ?,
           execution_state = CASE WHEN ? = 1 THEN 'complete' ELSE NULL END,
           execution_actor_role = 'teacher', execution_actor_id = ?, executed_at = NOW(3)
       WHERE plan_id = ? AND student_id = ? AND task_date = ? AND task_type = 'repeat' AND track = ?
         AND from_surah = ? AND from_ayah = ? AND to_surah = ? AND to_ayah = ?`,
      [
        completed ? 'done' : 'not_done', completed ? 1 : 0, completed ? 1 : 0, completed ? 1 : 0,
        importedRepeatCount, importedListeningCount, completed ? 1 : 0, link.teacherId,
        link.planId, link.studentId, day.date, track,
        Number(day.surah_from), Number(day.verse_from), Number(day.surah_to), Number(day.verse_to),
      ]
    );
    await connection.query(
      `UPDATE student_quran_tasks SET actual_link_count = NULL
       WHERE plan_id = ? AND student_id = ? AND task_date = ? AND task_type = 'memorization' AND track = ?`,
      [link.planId, link.studentId, day.date, track]
    );
    const [[standaloneLink]] = await connection.query(
      `SELECT id FROM student_quran_tasks WHERE plan_id = ? AND student_id = ? AND task_date = ?
       AND task_type = 'link' AND actual_link_count IS NOT NULL LIMIT 1`,
      [link.planId, link.studentId, day.date]
    );
    if (!standaloneLink) await connection.query(
      'UPDATE student_quran_tasks SET actual_link_count = ? WHERE id = ?',
      [importedLinkCount, Number(first.id)]
    );
  return { importedRepeatCount, importedListeningCount, importedLinkCount };
}


/** Persist authoritative remote outcomes and idempotent attempt identities within the caller transaction. */
async function persistRemoteTaskAttempts({ tasks, completed, authoritativeEnd, direction, totalErrors, rewardSettings, day, track, connection, link, attemptIds, dailyFollowUpId }) {
  for (let index = 0;index < tasks.length;index += 1) {
    const task = tasks[index];
    const taskStart = { page: task.fromPage, surah: task.fromSurah, ayah: task.fromAyah };
    const taskEnd = { page: task.toPage, surah: task.toSurah, ayah: task.toAyah };
    const taskCompleted = completed
      && compareNazemTaskPosition(authoritativeEnd, taskStart, direction) >= 0;
    const _resolveTaskActual = () => {
      if (taskCompleted) {
        if (compareNazemTaskPosition(authoritativeEnd, taskEnd, direction) < 0) {
          return authoritativeEnd;
        }
        return taskEnd;
      }
      return null;
    };
    const taskActual = _resolveTaskActual();
    const _resolveExecutionState = () => {
      if (taskCompleted) {
        if (compareNazemTaskPosition(taskActual, taskEnd, direction) < 0) {
          return 'partial';
        }
        return 'complete';
      }
      return null;
    };
    const executionState = _resolveExecutionState();
    const mistakes = index === 0 ? totalErrors : 0;
    const evaluatedFaces = recitationFacesFromLines(taskStart, taskActual || taskEnd) || Number(task.targetPages || 1);
    const policy = getRecitationEvaluationPolicy(rewardSettings, { taskType: day.taskType, track, targetPages: task.targetPages, evaluatedFaces });
    const maxScore = Math.max(1, Math.round(Number(policy.maxScore || 100)));
    const passingScore = Math.min(maxScore, Math.max(1, Math.round(Number(policy.passingScore || 85))));
    const rawScore = calculateRecitationScore(policy, evaluatedFaces, 0, mistakes);
    const score = taskCompleted
      ? Math.max(passingScore, rawScore)
      : Math.min(passingScore - 1, rawScore);
    await connection.query(
      `UPDATE student_quran_tasks SET teacher_rating_key = 'score', teacher_rating_label = ?,
        warning_count = 0, mistake_count = ?, evaluation_score = ?, evaluation_max_score = ?,
        evaluation_warning_deduction = ?, evaluation_mistake_deduction = ?,
        evaluation_passing_score = ?, teacher_completed = ?,
        student_status = ?, actual_to_page = ?, actual_to_surah = ?, actual_to_ayah = ?,
        execution_state = ?, execution_actor_role = 'teacher', execution_actor_id = ?, executed_at = NOW(3),
        evaluated_by = ?, evaluated_at = NOW(3)
       WHERE id = ?`,
      [taskCompleted ? 'متقن' : 'يحتاج إعادة', mistakes, score, maxScore,
      policy.warningDeduction, policy.mistakeDeduction, passingScore,
      taskCompleted ? 1 : 0,
      taskCompleted ? 'done' : 'not_done',
      taskActual?.page || null,
      taskActual?.surah || null,
      taskActual?.ayah || null,
        executionState,
      link.teacherId,
      link.teacherId,
      task.id]
    );
    const requestId = `nazem:${day.id}:${task.id}`;
    await connection.query(
      `UPDATE student_quran_recitation_attempts SET is_official = 0
       WHERE task_id = ? AND is_official = 1 AND COALESCE(request_id, '') <> ?`,
      [task.id, requestId]
    );
    const [[sequence]] = await connection.query(
      'SELECT COALESCE(MAX(attempt_number), 0) + 1 AS attemptNumber FROM student_quran_recitation_attempts WHERE task_id = ?',
      [task.id]
    );
    const [attempt] = await connection.query(
      `INSERT INTO student_quran_recitation_attempts
        (task_id, student_id, evaluator_id, session_date, attempt_number, request_id,
         is_official, warning_count, mistake_count, evaluation_score, evaluation_max_score,
         evaluation_warning_deduction, evaluation_mistake_deduction, evaluation_passing_score,
         teacher_completed, ayah_marks_json, word_marks_json)
       VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?, ?, ?, ?, '[]', '[]')
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), is_official = 1,
         evaluator_id = VALUES(evaluator_id), warning_count = 0,
         mistake_count = VALUES(mistake_count), evaluation_score = VALUES(evaluation_score),
         evaluation_max_score = VALUES(evaluation_max_score),
         evaluation_warning_deduction = VALUES(evaluation_warning_deduction),
         evaluation_mistake_deduction = VALUES(evaluation_mistake_deduction),
         evaluation_passing_score = VALUES(evaluation_passing_score),
         teacher_completed = VALUES(teacher_completed), ayah_marks_json = '[]', word_marks_json = '[]',
         evaluated_at = NOW(3)`,
      [task.id, link.studentId, link.teacherId, day.date, Number(sequence.attemptNumber || 1),
        requestId, mistakes, score, maxScore,
      policy.warningDeduction, policy.mistakeDeduction, passingScore, taskCompleted ? 1 : 0]
    );
    attemptIds.push(Number(attempt.insertId));
    const fingerprint = crypto.createHash('sha256')
      .update(`${link.teacherId}:nazem:${day.id}:${task.id}`)
      .digest('hex');
    await connection.query(
      `INSERT INTO nazem_recitation_links
        (ruwasi_recitation_id, ruwasi_task_id, ruwasi_plan_id, teacher_id,
         daily_follow_up_id, external_fingerprint, sync_status, last_synced_at, remote_snapshot)
       VALUES (?, ?, ?, ?, ?, ?, 'synced', NOW(3), ?)
       ON DUPLICATE KEY UPDATE daily_follow_up_id = VALUES(daily_follow_up_id),
         sync_status = 'synced', last_synced_at = NOW(3), remote_snapshot = VALUES(remote_snapshot),
         last_error_code = NULL, last_error = NULL`,
      [attempt.insertId, task.id, link.planId, link.teacherId, dailyFollowUpId, fingerprint, JSON.stringify(day)]
    );
  }
}


/** Match existing receipt-bound recitations before importing remote data or recording a local conflict. */
async function reconcileExistingRemoteFollowUp({ existingGrouped, local, day, connection, dailyFollowUpId, link }) {
if (existingGrouped?.recitations?.length) {
    local = recitationIdentityFromReceipt(day, existingGrouped.recitations, local);
    const existingLocal = { ...mapRuwasiRecitationGroupToNazem(existingGrouped.recitations),
      ...(local?.nazemSourceDayId ? { nazemSourceDayId: local.nazemSourceDayId } : {}),
      ...(local?.nazemLateId ? { nazemLateId: local.nazemLateId } : {}),
      ...(local?.nazemSavedTarget ? { nazemSavedTarget: local.nazemSavedTarget } : {}),
    };
    await connection.query(
      'UPDATE nazem_daily_follow_up_links SET local_snapshot = ? WHERE id = ?',
      [JSON.stringify(existingLocal), dailyFollowUpId],
    );
    if (remoteFollowUpMatchesLocal(day, existingLocal)) {
      await connection.query(
        `UPDATE nazem_daily_follow_up_links SET sync_status = 'synced', nazem_record_id = ?,
          remote_snapshot = ?, last_synced_at = NOW(3), last_remote_checked_at = NOW(3),
          last_error_code = NULL, last_error = NULL WHERE id = ?`,
        [String(day.id), JSON.stringify(day), dailyFollowUpId],
      );
      await connection.query(
        `UPDATE nazem_recitation_links SET sync_status = 'synced', remote_snapshot = ?,
          last_synced_at = NOW(3), last_error_code = NULL, last_error = NULL
         WHERE daily_follow_up_id = ? AND teacher_id = ? AND ruwasi_recitation_id IN (?)`,
        [JSON.stringify(day), dailyFollowUpId, link.teacherId, existingGrouped.recitations.map(attempt => attempt.id)],
      );
      await resolveOpenNazemConflicts(connection, 'recitation_day', dailyFollowUpId, 'matched_automatically');
      await importNazemLinkResult(connection, link, day, dailyFollowUpId);
      await enqueueNazemPointReconciliation(connection, dailyFollowUpId, day);
      await reconcileConfirmedRecitationJobs(connection, link.teacherId);
      return { synced: 1, conflicts: 0, imported: 0 };
    }
    if (hasLocalRecitation(existingGrouped.recitations)) {
      await connection.query(
        `UPDATE nazem_daily_follow_up_links SET sync_status = 'conflict',
          last_error_code = 'NAZEM_LOCAL_RESULT_CONFLICT',
          last_error = 'تختلف نتيجة ناظم عن التقييم المحلي المحفوظ؛ لم تتغير النتيجة أو العلامات وتحتاج مطابقة.'
         WHERE id = ?`, [dailyFollowUpId],
      );
      return { synced: 0, conflicts: 1, imported: 0, review: 1, issueCode: 'NAZEM_LOCAL_RESULT_CONFLICT' };
    }
  }


  return null;
}
const NAZEM_ATTENDANCE_TO_RUWASI = Object.freeze({
  2: 'present',
  3: 'absent',
  4: 'excused',
  5: 'late',
});

export function shouldApplyRemoteAttendance({ remoteStatus }) {
  return Object.values(NAZEM_ATTENDANCE_TO_RUWASI).includes(remoteStatus);
}

export async function applyRemoteAttendanceToRuwasi(connection, studentId, remoteAttendance, { inTransaction = false } = {}) {
  const status = NAZEM_ATTENDANCE_TO_RUWASI[Number(remoteAttendance?.attendanceStatus)];
  const date = String(remoteAttendance?.date || '').slice(0, 10);
  if (!status || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (!shouldApplyRemoteAttendance({ remoteStatus: status })) return false;
  if (!inTransaction) await connection.beginTransaction();
  try {
    await connection.query('SELECT id FROM students WHERE id = ? FOR UPDATE', [studentId]);
    const [[pendingChange]] = await connection.query(`SELECT id FROM nazem_sync_jobs
      WHERE operation_type = 'attendance.submit' AND student_id = ?
        AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.date')) = ?
        AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.explicitChange')) = 'true'
        AND status IN ('pending','retrying','syncing','failed','blocked','requires_review','conflict')
        AND id <> ? LIMIT 1`, [studentId, date, Number(remoteAttendance.activeJobId || 0)]);
    if (pendingChange) {
      if (!inTransaction) await connection.commit();
      return false;
    }
    const settings = await loadAttendancePointSettings(connection);
    await saveAttendanceWithPoints(connection, { studentId, date, status, awardNewPoints: date === getBusinessDate() }, settings);
    await connection.query(
      `UPDATE nazem_sync_jobs
       SET status = 'dismissed', lease_owner = NULL, lease_expires_at = NULL,
         last_error_code = 'NAZEM_REMOTE_AUTHORITATIVE',
         last_error = 'اعتمد حضور ناظم الأحدث لهذا اليوم.'
       WHERE operation_type = 'attendance.submit' AND student_id = ?
         AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.date')) = ?
         AND status IN ('pending','retrying','syncing','failed','blocked','requires_review','conflict')
         AND id <> ?`,
      [studentId, date, Number(remoteAttendance.activeJobId || 0)],
    );
    if (!inTransaction) await connection.commit();
  } catch (error) {
    if (!inTransaction) await connection.rollback();
    throw error;
  }
  return true;
}

async function discoverTeacherData(connection, job, adapter, {
  progressStart = 20,
  progressEnd = 75,
} = {}) {
  let remoteStudents = await adapter.getStudents();
  const studentsSavedProgress = progressStart + ((progressEnd - progressStart) * 0.2);
  await updateNazemJobProgress(connection, job, studentsSavedProgress, 'students_loaded');
  const targetStudentExternalId = String(job.payload?.studentExternalId || '');
  const planStudents = targetStudentExternalId
    ? remoteStudents.filter((student) => String(student.externalId) === targetStudentExternalId)
    : remoteStudents;
  if (targetStudentExternalId && planStudents.length !== 1) {
    throw reviewNazemError(
      'تعذر العثور على الطالب المطلوب في حساب ناظم لإعادة المحاولة.',
      'NAZEM_RETRY_STUDENT_NOT_FOUND',
    );
  }
  const discoveryResult = await adapter.discoverStudentPlans(planStudents, {
    includeMissingStudents: !targetStudentExternalId,
    onProgress: async (completed, total) => updateNazemJobProgress(
      connection,
      job,
      studentsSavedProgress + ((completed / total) * (progressEnd - studentsSavedProgress)),
      'plans_loading',
    ),
  });
  if (!targetStudentExternalId && discoveryResult?.students) remoteStudents = discoveryResult.students;
  const studentDiscovery = await saveDiscoveredStudents(connection, job.teacherId, remoteStudents);
  const remotePlans = Array.isArray(discoveryResult)
    ? discoveryResult
    : (discoveryResult?.plans || []);
  const discoveryIssues = Array.isArray(discoveryResult)
    ? []
    : (discoveryResult?.issues || []);
  const planDiscovery = await saveDiscoveredPlans(
    connection,
    job.teacherId,
    remotePlans,
    discoveryIssues,
    { preserveUndiscovered: Boolean(targetStudentExternalId) },
  );
  for (const remotePlan of remotePlans) {
    const remoteAttendanceStatus = Number(remotePlan.progress?.attendanceStatus || 0);
    if (![2, 3, 4, 5].includes(remoteAttendanceStatus) || !remotePlan.progress?.date) continue;
    const [[candidate]] = await connection.query(
      `SELECT ruwasi_student_id AS studentId
       FROM nazem_plan_candidates
       WHERE teacher_id = ? AND nazem_plan_id = ? AND nazem_student_id = ?
         AND ruwasi_student_id IS NOT NULL
       ORDER BY id DESC LIMIT 1`,
      [job.teacherId, remotePlan.externalId, remotePlan.student?.externalId],
    );
    if (candidate?.studentId) {
      await applyRemoteAttendanceToRuwasi(connection, candidate.studentId, {
        date: remotePlan.progress.date,
        attendanceStatus: remoteAttendanceStatus,
      });
    }
  }
  if (discoveryIssues.length) {
    await connection.query(
      `UPDATE nazem_accounts SET last_error_code = 'NAZEM_PLAN_DISCOVERY_PARTIAL',
        last_error = ? WHERE teacher_id = ? AND status = 'connected'`,
      [`اكتملت المزامنة مع تعذر قراءة ${discoveryIssues.length} من الطلاب أو مجموعات الخطط.`, job.teacherId],
    );
  }
  await updateNazemJobProgress(connection, job, progressEnd, 'plans_saved');
  return {
    remoteStudents,
    remotePlans,
    discoveryIssues,
    studentDiscovery,
    planDiscovery,
  };
}

async function discoverTeacherPlans(connection, job) {
  const { adapter } = await openAdapterForTeacher(connection, job.teacherId);
  try {
    await updateNazemJobProgress(connection, job, 8, 'connecting');
    const context = await adapter.login();
    await updateNazemJobProgress(connection, job, 15, 'connected');
    await connection.query(
      `UPDATE nazem_accounts SET status = 'connected', encrypted_session_state = ?,
        last_verified_at = NOW(3), last_successful_login_at = NOW(3),
        last_error_code = NULL, last_error = NULL WHERE teacher_id = ?`,
      [encryptNazemJson(context.sessionState), job.teacherId],
    );
    const discovery = await discoverTeacherData(connection, job, adapter, {
      progressStart: 18,
      progressEnd: 96,
    });
    await connection.query(
      `UPDATE nazem_accounts SET encrypted_session_state = ?, status = 'connected',
        last_verified_at = NOW(3), last_successful_login_at = NOW(3),
        last_error_code = NULL, last_error = NULL WHERE teacher_id = ?`,
      [encryptNazemJson(await adapter.getSessionState()), job.teacherId],
    );
    return {
      ...discovery.studentDiscovery,
      ...discovery.planDiscovery,
      discoveryIssues: discovery.discoveryIssues.slice(0, 20),
    };
  } catch (cause) {
    throw translateAdapterFailure(cause, 'تحديث الطلاب والخطط');
  } finally {
    await adapter.close();
  }
}

async function applyRemoteAttendanceForImport(connection, studentId, attendance, inTransaction = false) {
  if (inTransaction) await connection.query('SAVEPOINT nazem_import_attendance');
  let result;
  try {
    result = await applyRemoteAttendanceToRuwasi(connection, studentId, attendance, { inTransaction });
  } catch (error) {
    if (![409, 422].includes(Number(error.statusCode))) throw error;
    if (inTransaction) await connection.query('ROLLBACK TO SAVEPOINT nazem_import_attendance');
    // The imported result's durable settlement retries attendance and reports the capacity issue.
    result = false;
  }
  if (inTransaction) await connection.query('RELEASE SAVEPOINT nazem_import_attendance');
  return result;
}

async function importRemoteFollowUpTransaction(connection, link, day) {
  await connection.beginTransaction();
  try {
    await connection.query('SELECT id FROM students WHERE id = ? FOR UPDATE', [link.studentId]);
    await syncNazemScheduledTaskRange(connection, link, day, { inTransaction: true });
    const result = await saveRemoteFollowUp(connection, link, day);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function importTeacherFollowUps(connection, link, history) {
  return importNazemFollowUpHistory(history, link, {
    applyAttendance: (studentId, attendance) => applyRemoteAttendanceForImport(connection, studentId, attendance),
    syncScheduled: (target, day) => syncNazemScheduledTaskRange(connection, target, day),
    saveFollowUp: (target, day) => importRemoteFollowUpTransaction(connection, target, day),
  });
}

async function refreshTeacherFollowUps(connection, job) {
  const started = Date.now();
  const timing = { queueWaitMs: Number(job.queueWaitMs || 0), loginMs: 0, fetchMs: 0, importMs: 0 };
  const { adapter } = await openAdapterForTeacher(connection, job.teacherId);
  try {
    await adapter.login();
    timing.loginMs = Date.now() - started;
    const [links] = await connection.query(
      `SELECT link.ruwasi_plan_id AS planId, link.ruwasi_student_id AS studentId,
        link.nazem_plan_id AS nazemPlanId, student.nazem_student_id AS nazemStudentId,
        student.nazem_student_name AS nazemStudentName
       FROM nazem_plan_links link
       JOIN nazem_student_links student ON student.teacher_id = link.teacher_id
         AND student.ruwasi_student_id = link.ruwasi_student_id
       JOIN student_quran_plans plan ON plan.id = link.ruwasi_plan_id AND plan.student_id = link.ruwasi_student_id AND plan.status IN ('active','completed')
       WHERE link.teacher_id = ? AND link.sync_status NOT IN ('deleted','detached')
         AND student.status = 'linked'`, [job.teacherId],
    );
    const issues = [];
    let imported = 0;
    const checkedStudentIds = [];
    imported = await refreshLinkedStudentFollowUps({ links, connection, job, adapter, timing, imported, issues, checkedStudentIds });
    if (issues.length) {
      const error = reviewNazemError(describeNazemFollowUpIssues(issues), 'NAZEM_FOLLOW_UP_PARTIAL');
      error.details = { issues, timing: { ...timing, totalMs: Date.now() - started } };
      throw error;
    }
    await markNazemFollowUpRefreshSucceeded(connection, job.teacherId, encryptNazemJson(await adapter.getSessionState()));
    return { checkedLinks: links.length, imported, timing: { ...timing, totalMs: Date.now() - started } };
  } finally { await adapter.close(); }
}

/** Refresh linked students in order and retain partial failures for review without discarding successful imports. */
async function refreshLinkedStudentFollowUps({ links, connection, job, adapter, timing, imported, issues, checkedStudentIds }) {
  const fetchedPlans = new Set();
  for (const [index, link] of links.entries()) {
    await updateNazemJobProgress(connection, job, 10 + (index / Math.max(1, links.length)) * 85, 'followups_loading');
    try {
      let phaseStarted = Date.now();
      const history = await adapter.readStudentFollowUpHistory(link.nazemPlanId, {
        nazemStudentId: link.nazemStudentId, nazemStudentName: link.nazemStudentName,
      }, 1, {
        freshCurrent: !fetchedPlans.has(String(link.nazemPlanId)),
        endDate: job.operationType === 'account.daily_reconcile' ? job.payload.workDate : null,
        confirmedRecordIds: await loadConfirmedNazemRecordIds(connection, { ...link, teacherId: job.teacherId })
      });
      fetchedPlans.add(String(link.nazemPlanId));
      timing.fetchMs += Date.now() - phaseStarted;
      phaseStarted = Date.now();
      const result = await importTeacherFollowUps(connection, { ...link, teacherId: job.teacherId }, history);
      imported += result.imported;
      if (result.review) issues.push(...(result.issues?.length ? result.issues : [{ studentId: link.studentId, code: 'NAZEM_FOLLOW_UP_REVIEW' }]));
      await revalidatePendingNazemIdentity(connection, adapter, { ...link, teacherId: job.teacherId });
      timing.importMs += Date.now() - phaseStarted;
      if (!links.slice(index + 1).some(next => Number(next.studentId) === Number(link.studentId))) checkedStudentIds.push(Number(link.studentId));
      await recordNazemStudentRefresh(connection, job, checkedStudentIds);
    } catch (error) {
      if (error.retryable || /LOGIN|AUTH|SESSION/.test(error.code || '')) throw error;
      issues.push({ studentId: link.studentId, code: error.code || 'NAZEM_FOLLOW_UP_FAILED' });
    }
  }
  return imported;
}

async function reconcileTeacher(connection, job) {
  const { adapter } = await openAdapterForTeacher(connection, job.teacherId);
  try {
    await updateNazemJobProgress(connection, job, 8, 'connecting');
    const context = await adapter.login();
    await updateNazemJobProgress(connection, job, 15, 'connected');
    await connection.query(
      `UPDATE nazem_accounts SET status = 'connected', encrypted_session_state = ?,
        last_verified_at = NOW(3), last_successful_login_at = NOW(3),
        last_error_code = NULL, last_error = NULL WHERE teacher_id = ?`,
      [encryptNazemJson(context.sessionState), job.teacherId],
    );
    const refreshPlansRequested = job.payload?.requestedFrom === 'student-plan-import'
      || Boolean(job.payload?.discoverPlans);
    const discovery = refreshPlansRequested
      ? await discoverTeacherData(connection, job, adapter, {
        progressStart: 20,
        progressEnd: 76,
      })
      : {
        remotePlans: [],
        discoveryIssues: [],
        studentDiscovery: {},
        planDiscovery: {},
      };
    const {
      remotePlans,
      discoveryIssues,
      studentDiscovery,
      planDiscovery,
    } = discovery;
    const remoteGroups = await adapter.listPlanGroups();
    await updateNazemJobProgress(connection, job, 82, 'links_loading');
    const [links] = await connection.query(
      `SELECT link.ruwasi_plan_id AS planId, link.ruwasi_student_id AS studentId,
        link.nazem_plan_id AS nazemPlanId, link.last_synced_snapshot AS lastSyncedSnapshot,
        studentLink.nazem_student_id AS nazemStudentId,
        studentLink.nazem_student_name AS nazemStudentName,
        student.name AS studentName
       FROM nazem_plan_links link
       JOIN nazem_student_links studentLink
         ON studentLink.teacher_id = link.teacher_id
        AND studentLink.ruwasi_student_id = link.ruwasi_student_id
       JOIN students student ON student.id = link.ruwasi_student_id
       WHERE link.teacher_id = ? AND link.sync_status IN ('synced','conflict')`,
      [job.teacherId],
    );
    let conflicts = 0;
    let localUpdates = 0;
    let remoteUpdates = 0;
    let planReview = 0;
    let dailyImported = 0;
    let dailySynced = 0;
    let dailyConflicts = 0;
    let dailyReview = 0;
    const planChanges = [];
    for (let linkIndex = 0; linkIndex < links.length; linkIndex += 1) {
      const link = links[linkIndex];
      await updateNazemJobProgress(
        connection,
        job,
        82 + ((linkIndex / Math.max(1, links.length)) * 14),
        'links_checking',
      );
      const plan = await loadPlan(connection, link.planId);
      const base = safeJson(link.lastSyncedSnapshot, {});
      const localSnapshot = mapNazemOwnedPlanSnapshot(plan, base.local);
      const remoteGroupExists = remoteGroups.some((group) => (
        String(group.externalId || '') === String(link.nazemPlanId || '')
      ));
      const discoveredRemotePlan = remotePlans.find((remotePlan) => (
        String(remotePlan.externalId || '') === String(link.nazemPlanId || '')
        && String(remotePlan.student?.externalId || '') === String(link.nazemStudentId || '')
      ));
      const remoteSnapshot = remoteGroupExists
        ? normalizeRemotePlanSnapshot(discoveredRemotePlan || await adapter.readPlanBundle(link.nazemPlanId, {
          nazemStudentId: link.nazemStudentId,
          nazemStudentName: link.nazemStudentName,
        }, localSnapshot))
        : null;
      if (!remoteSnapshot) {
        await connection.query(
          `UPDATE nazem_plan_links SET sync_status = 'requires_review',
            last_remote_checked_at = NOW(3), last_error_code = 'NAZEM_REMOTE_PLAN_NOT_FOUND',
            last_error = 'تعذر العثور على الخطة المرتبطة في ناظم.'
           WHERE ruwasi_plan_id = ? AND teacher_id = ?`,
          [link.planId, job.teacherId],
        );
        planChanges.push({
          studentId: Number(link.studentId),
          studentName: link.studentName || link.nazemStudentName || 'طالب',
          planId: Number(link.planId),
          status: 'requires_review',
          message: 'تعذر العثور على الخطة المرتبطة في ناظم.',
          differences: '',
        });
        planReview += 1;
        continue;
      }
      const localChanged = snapshotHash(localSnapshot) !== snapshotHash(base.local || {});
      const remoteChanged = snapshotHash(remoteSnapshot)
        !== snapshotHash(normalizeRemotePlanSnapshot(base.remote) || {});
      if (remoteChanged || localChanged) {
        const differences = describeNazemPlanDifference(localSnapshot, remoteSnapshot);
        try {
          await applyRemotePlanToRuwasi(connection, {
            link,
            teacherId: job.teacherId,
            remoteSnapshot,
          });
          remoteUpdates += 1;
          planChanges.push({
            studentId: Number(link.studentId),
            studentName: link.studentName || link.nazemStudentName || 'طالب',
            planId: Number(link.planId),
            status: 'applied',
            changedInNazem: remoteChanged,
            changedInRuwasi: localChanged,
            message: 'تم تحديث الخطة في الحبيب ماب من ناظم.',
            differences,
          });
        } catch (error) {
          await connection.query(
            `UPDATE nazem_plan_links SET sync_status = 'requires_review',
              last_remote_checked_at = NOW(3), remote_snapshot = ?,
              last_error_code = ?, last_error = ?
             WHERE ruwasi_plan_id = ? AND teacher_id = ?`,
            [JSON.stringify(remoteSnapshot), error?.code || 'NAZEM_REMOTE_APPLY_FAILED',
            String(error?.message || 'تعذر تطبيق خطة ناظم في المنصة.').slice(0, 500),
            link.planId, job.teacherId],
          );
          planReview += 1;
          planChanges.push({
            studentId: Number(link.studentId),
            studentName: link.studentName || link.nazemStudentName || 'طالب',
            planId: Number(link.planId),
            status: 'requires_review',
            changedInNazem: remoteChanged,
            changedInRuwasi: localChanged,
            message: String(error?.message || 'تعذر تطبيق خطة ناظم في الحبيب ماب.').slice(0, 300),
            differences,
          });
          continue;
        }
      }
      const remoteHistory = await adapter.readStudentFollowUpHistory(link.nazemPlanId, {
        nazemStudentId: link.nazemStudentId,
        nazemStudentName: link.nazemStudentName,
      });
      const imported = await importTeacherFollowUps(connection, { ...link, teacherId: job.teacherId }, remoteHistory);
      dailyImported += imported.imported;
      dailySynced += imported.synced;
      dailyConflicts += imported.conflicts;
      dailyReview += imported.review;
      await enqueueMissingNazemAttendance(connection, { teacherId: job.teacherId, studentId: link.studentId });
      await connection.query(
        `UPDATE nazem_plan_links SET last_remote_checked_at = NOW(3), remote_snapshot = ?
         WHERE ruwasi_plan_id = ? AND teacher_id = ?`,
        [JSON.stringify(remoteSnapshot), link.planId, job.teacherId],
      );
    }
    const backfilledRecitations = await enqueueMissingNazemRecitations(connection, job.teacherId);
    await updateNazemJobProgress(connection, job, 98, 'finalizing');
    await connection.query(
      `UPDATE nazem_accounts SET encrypted_session_state = ?, status = 'connected',
        last_verified_at = NOW(3), last_successful_login_at = NOW(3),
        last_error_code = NULL, last_error = NULL WHERE teacher_id = ?`,
      [encryptNazemJson(await adapter.getSessionState()), job.teacherId],
    );
    return {
      remotePlanCount: remoteGroups.length,
      checkedLinks: links.length,
      conflicts,
      localUpdates,
      remoteUpdates,
      planReview,
      backfilledRecitations,
      dailyImported,
      dailySynced,
      dailyConflicts,
      dailyReview,
      planChanges,
      discoveryIssues: discoveryIssues.slice(0, 20),
      ...studentDiscovery,
      ...planDiscovery,
    };
  } catch (cause) {
    throw translateAdapterFailure(cause, 'فحص التغييرات');
  } finally {
    await adapter.close();
  }
}

async function syncPlanDeletion(connection, job) {
  const [[link]] = await connection.query(
    `SELECT ruwasi_student_id AS studentId, nazem_plan_id AS nazemPlanId
     FROM nazem_plan_links WHERE ruwasi_plan_id = ? AND teacher_id = ? LIMIT 1`,
    [job.entityId || job.payload.planId, job.teacherId],
  );
  if (!link) return { alreadyRemoved: true };
  if (!link.nazemPlanId) {
    await connection.query(
      "UPDATE nazem_plan_links SET sync_status = 'deleted', last_error_code = NULL, last_error = NULL WHERE ruwasi_plan_id = ? AND teacher_id = ?",
      [job.entityId, job.teacherId],
    );
    return { alreadyRemoved: true };
  }
  const studentLink = await loadStudentLink(connection, job.teacherId, link.studentId);
  const { adapter } = await openAdapterForTeacher(connection, job.teacherId);
  try {
    await adapter.login();
    const result = await adapter.deletePlan(studentLink, link.nazemPlanId);
    await connection.query(
      `UPDATE nazem_plan_links SET sync_status = 'deleted', last_remote_checked_at = NOW(3),
        last_error_code = NULL, last_error = NULL, remote_snapshot = ?
       WHERE ruwasi_plan_id = ? AND teacher_id = ?`,
      [JSON.stringify(result || {}), job.entityId, job.teacherId],
    );
    await connection.query(
      `UPDATE nazem_accounts SET encrypted_session_state = ?, status = 'connected',
        last_successful_login_at = NOW(3), last_error_code = NULL, last_error = NULL
       WHERE teacher_id = ?`,
      [encryptNazemJson(await adapter.getSessionState()), job.teacherId],
    );
    return result;
  } catch (cause) {
    throw translateAdapterFailure(cause, 'حذف الخطة');
  } finally {
    await adapter.close();
  }
}

export async function processNazemJob(job, connection = db()) {
  switch (job.operationType) {
    case 'account.verify':
      return verifyAccount(connection, job);
    case 'account.refresh_followups':
      return refreshTeacherFollowUps(connection, job);
    case 'account.daily_reconcile': {
      const result = await refreshTeacherFollowUps(connection, job);
      await enqueueMissingNazemRecitations(connection, job.teacherId);
      await connection.query(`UPDATE nazem_point_reconciliations work
        JOIN nazem_daily_follow_up_links daily ON daily.id = work.daily_follow_up_id
        SET work.status = 'pending' WHERE daily.teacher_id = ? AND daily.follow_up_date = ?
          AND work.status IN ('synced','requires_review')`, [job.teacherId, job.payload.workDate]);
      return { ...result, workDate: job.payload.workDate, pointsVerification: 'pending' };
    }
    case 'account.reconcile':
      return reconcileTeacher(connection, job);
    case 'account.discover_plans':
      return discoverTeacherPlans(connection, job);
    case 'plan.upsert':
      return syncPlan(connection, job);
    case 'recitation.submit':
      return syncRecitation(connection, job);
    case 'attendance.submit':
      return syncAttendance(connection, job);
    case 'plan.delete':
      return syncPlanDeletion(connection, job);
    default:
      throw reviewNazemError('نوع عملية مزامنة ناظم غير معروف.', 'NAZEM_JOB_UNKNOWN');
  }
}

export async function applyNazemEntityFailure(connection, job, error, status) {
  const errorCode = String(error?.code || 'NAZEM_ERROR').slice(0, 80);
  const message = String(error?.message || 'تعذرت المزامنة.').slice(0, 500);
  if (job.entityType === 'account' && job.operationType === 'account.verify') {
    const accountStatus = ['retrying', 'blocked', 'requires_review', 'failed'].includes(status)
      ? status
      : 'failed';
    await connection.query(
      `UPDATE nazem_accounts SET status = ?, last_error_code = ?, last_error = ?, last_verified_at = NOW(3)
       WHERE teacher_id = ?`,
      [accountStatus, errorCode, message, job.teacherId],
    );
  } else if (job.entityType === 'account'
    && ['account.reconcile', 'account.discover_plans', 'account.refresh_followups', 'account.daily_reconcile'].includes(job.operationType)) {
    await connection.query(
      `UPDATE nazem_accounts SET last_error_code = ?, last_error = ?, last_verified_at = NOW(3)
       WHERE teacher_id = ? AND status = 'connected'`,
      [errorCode, message, job.teacherId],
    );
  } else if (job.entityType === 'plan' && job.entityId) {
    await connection.query(
      `UPDATE nazem_plan_links SET sync_status = ?, last_error_code = ?, last_error = ?
       WHERE ruwasi_plan_id = ? AND teacher_id = ?`,
      [status, errorCode, message, job.entityId, job.teacherId],
    );
  } else if (job.entityType === 'recitation_day' && job.entityId) {
    await connection.query(
      `UPDATE nazem_daily_follow_up_links SET sync_status = ?, last_error_code = ?, last_error = ?,
        remote_snapshot = COALESCE(?, remote_snapshot), last_remote_checked_at = NOW(3)
       WHERE id = ? AND teacher_id = ?`,
      [status, errorCode, message,
        error?.details?.remote ? JSON.stringify(error.details.remote) : null,
        job.entityId, job.teacherId],
    );
    await connection.query(
      `UPDATE nazem_recitation_links SET sync_status = ?, last_error_code = ?, last_error = ?
       WHERE daily_follow_up_id = ? AND teacher_id = ?`,
      [status, errorCode, message, job.entityId, job.teacherId],
    );
    await recordDailyFollowUpConflict({ status, connection, job, error, errorCode, message });
  } else if (job.entityType === 'recitation' && job.entityId) {
    await connection.query(
      `UPDATE nazem_recitation_links SET sync_status = ?, last_error_code = ?, last_error = ?
       WHERE ruwasi_recitation_id = ? AND teacher_id = ?`,
      [status, errorCode, message, job.entityId, job.teacherId],
    );
    await recordRecitationConflict({ status, connection, job, error, errorCode, message });
  }
}

export const parseNazemSnapshot = (value) => safeJson(value, {});

/** Preserve existing open conflicts and create a snapshot only when none exists. */
async function recordRecitationConflict({ status, connection, job, error, errorCode, message }) {
  if (status === 'conflict') {
    const [[link]] = await connection.query(
      `SELECT local_snapshot AS localSnapshot, remote_snapshot AS remoteSnapshot
         FROM nazem_recitation_links WHERE ruwasi_recitation_id = ? AND teacher_id = ? LIMIT 1`,
      [job.entityId, job.teacherId]
    );
    const [[existing]] = await connection.query(
      `SELECT id FROM nazem_sync_conflicts
         WHERE entity_type = 'recitation' AND entity_id = ? AND status = 'open' LIMIT 1`,
      [job.entityId]
    );
    if (!existing) {
      await connection.query(
        `INSERT INTO nazem_sync_conflicts
            (entity_type, entity_id, teacher_id, local_snapshot, remote_snapshot, base_snapshot)
           VALUES ('recitation', ?, ?, ?, ?, NULL)`,
        [
          job.entityId,
          job.teacherId,
          JSON.stringify(safeJson(link?.localSnapshot, {})),
          JSON.stringify(error?.details?.remote || safeJson(link?.remoteSnapshot, { errorCode, message })),
        ]
      );
    }
  }
}

/** Record the current daily follow-up snapshots when synchronization conflicts. */
async function recordDailyFollowUpConflict({ status, connection, job, error, errorCode, message }) {
  if (status === 'conflict') {
    const [[link]] = await connection.query(
      `SELECT local_snapshot AS localSnapshot, remote_snapshot AS remoteSnapshot
         FROM nazem_daily_follow_up_links WHERE id = ? AND teacher_id = ? LIMIT 1`,
      [job.entityId, job.teacherId]
    );
    await saveOpenNazemConflict(connection, {
      entityType: 'recitation_day',
      entityId: job.entityId,
      teacherId: job.teacherId,
      localSnapshot: safeJson(link?.localSnapshot, {}),
      remoteSnapshot: error?.details?.remote || safeJson(link?.remoteSnapshot, { errorCode, message }),
    });
  }
}

/** Reconcile one discovered plan against its saved baseline without accepting ambiguous student matches. */
async function reconcileDiscoveredPlan({ connection, teacherId, candidate, linked, review }) {

    if (!candidate.studentId) {
      review += 1;
      return { linked, review };
    }
    if (Number(candidate.candidateCount || 0) > 1) {
      await connection.query(
        `UPDATE nazem_plan_candidates SET discovery_status = 'requires_review',
          last_error_code = 'NAZEM_MULTIPLE_ACTIVE_PLANS',
          last_error = 'وجدنا أكثر من خطة ناظم للطالب؛ اختر الخطة التي تريد اعتمادها.' WHERE id = ?`,
        [candidate.id],
      );
      review += 1;
      return { linked, review };
    }
    if (!candidate.localPlanId) {
      await connection.query(
        `UPDATE nazem_plan_candidates SET discovery_status = 'discovered',
          last_error_code = NULL, last_error = NULL WHERE id = ?`,
        [candidate.id],
      );
      return { linked, review };
    }
    const [[existingLink]] = await connection.query(
      `SELECT id, remote_snapshot AS remoteSnapshot, last_synced_snapshot AS lastSyncedSnapshot
       FROM nazem_plan_links
       WHERE ruwasi_plan_id = ? AND teacher_id = ? AND nazem_plan_id = ? LIMIT 1`,
      [candidate.localPlanId, teacherId, candidate.nazemPlanId],
    );
    if (existingLink) {
      const remoteSnapshot = safeJson(candidate.remoteSnapshot, {});
      const synced = safeJson(existingLink.lastSyncedSnapshot, {});
      const baseline = synced.remote || safeJson(existingLink.remoteSnapshot, {});
      const changed = !nazemPlanBundleMatches(remoteSnapshot, baseline);
      await connection.query(
        `UPDATE nazem_plan_candidates SET discovery_status = ?, last_error_code = NULL,
          last_error = NULL WHERE id = ?`,
        [changed ? 'discovered' : 'linked', candidate.id],
      );
      if (changed) review += 1;
      else linked += 1;
      return { linked, review };
    }
    const localPlan = await loadPlan(connection, candidate.localPlanId);
    const reviewRange = await loadPlanReviewRange(connection, localPlan);
    const mappedLocal = mapRuwasiPlanBundleToNazem(localPlan, reviewRange);
    const remoteSnapshot = safeJson(candidate.remoteSnapshot, {});
    if (!nazemPlanBundleMatches(remoteSnapshot, mappedLocal)) {
      await connection.query(
        `UPDATE nazem_plan_candidates SET discovery_status = 'discovered',
          last_error_code = NULL, last_error = NULL WHERE id = ?`,
        [candidate.id],
      );
      return { linked, review };
    }
    await connection.query(
      `INSERT INTO nazem_plan_links
        (ruwasi_plan_id, ruwasi_student_id, teacher_id, nazem_student_id,
         nazem_plan_id, external_fingerprint, sync_status, last_synced_at,
         last_remote_checked_at, local_snapshot, remote_snapshot, last_synced_snapshot)
       VALUES (?, ?, ?, ?, ?, ?, 'synced', NOW(3), NOW(3), ?, ?, ?)
       ON DUPLICATE KEY UPDATE nazem_plan_id = VALUES(nazem_plan_id),
         sync_status = 'synced', last_error_code = NULL, last_error = NULL,
         last_remote_checked_at = NOW(3), remote_snapshot = VALUES(remote_snapshot)`,
      [
        localPlan.id,
        candidate.studentId,
        teacherId,
        candidate.nazemStudentId,
        candidate.nazemPlanId,
        snapshotHash(remoteSnapshot),
        JSON.stringify(mappedLocal),
        JSON.stringify(remoteSnapshot),
        JSON.stringify({ local: mappedLocal, remote: remoteSnapshot }),
      ],
    );
    await connection.query(
      "UPDATE nazem_plan_candidates SET discovery_status = 'linked', last_error_code = NULL, last_error = NULL WHERE id = ?",
      [candidate.id],
    );
    linked += 1;
  
 return { linked, review };
}
