import { reviewNazemError } from './errors.js';

const parse = value => typeof value === 'string' ? JSON.parse(value) : value;

// Legacy jobs can inspect an identified parent record, but remain verification-only.
export async function resolveLegacyRecitationTarget(connection, { daily, recitations, studentLink, planLink, attemptId }) {
  const local = parse(daily?.localSnapshot) || {};
  const target = {
    source: local.nazemSavedTarget,
    attemptIds: local.attemptIds || (attemptId ? [Number(attemptId)] : []),
    studentExternalId: studentLink.nazemStudentId, planExternalId: planLink.nazemPlanId,
  };
  if (!target.source && daily?.taskType === 'link') {
    const parent = await captureRecitationTarget(connection, daily.id, target.attemptIds.join('-'));
    if (parent.source && !parent.source.nazemLate
      && parent.source.remoteType === 'conserve'
      && String(parent.source.date || '').slice(0, 10) === daily.taskDate
      && String(parent.studentExternalId) === String(studentLink.nazemStudentId)
      && String(parent.planExternalId) === String(planLink.nazemPlanId)) target.source = parent.source;
  }
  if (!target.source) throw reviewNazemError('التقييم القديم لا يحتوي هوية مصدر قابلة للتحقق. بقي محفوظًا ولم يُعد إرساله.', 'NAZEM_LEGACY_SOURCE_UNVERIFIED');
  validateRecitationTarget(target, recitations, studentLink, planLink);
  return target;
}

export async function captureRecitationTarget(connection, dailyFollowUpId, attemptSignature) {
  const [[row]] = await connection.query(
    `SELECT CASE WHEN daily.task_type = 'link' THEN (
        SELECT COALESCE(JSON_EXTRACT(source.local_snapshot, '$.nazemSavedTarget'), source.remote_snapshot) FROM nazem_daily_follow_up_links source
        WHERE source.ruwasi_plan_id = daily.ruwasi_plan_id AND source.ruwasi_student_id = daily.ruwasi_student_id
          AND source.teacher_id = daily.teacher_id AND source.follow_up_date = daily.follow_up_date
          AND source.task_type = 'memorization' AND source.track = daily.track LIMIT 1
      ) WHEN daily.task_type = 'review' THEN daily.remote_snapshot
      ELSE COALESCE(JSON_EXTRACT(daily.local_snapshot, '$.nazemSavedTarget'), daily.remote_snapshot) END AS source, student.nazem_student_id AS studentExternalId,
      plan.nazem_plan_id AS planExternalId
     FROM nazem_daily_follow_up_links daily
     JOIN nazem_plan_links plan ON plan.ruwasi_plan_id = daily.ruwasi_plan_id AND plan.teacher_id = daily.teacher_id
       AND plan.ruwasi_student_id = daily.ruwasi_student_id
     JOIN nazem_student_links student ON student.ruwasi_student_id = daily.ruwasi_student_id AND student.teacher_id = daily.teacher_id
     WHERE daily.id = ? LIMIT 1`, [dailyFollowUpId],
  );
  return { source: parse(row?.source) || null, studentExternalId: row?.studentExternalId,
    planExternalId: row?.planExternalId, attemptIds: attemptSignature.split('-').map(Number) };
}

export function validateRecitationTarget(target, recitations, studentLink, planLink) {
  const actualIds = recitations.map(item => Number(item.id)).sort((a, b) => a - b);
  const expectedIds = [...(target?.attemptIds || [])].sort((a, b) => a - b);
  if (!target?.source?.id || !target.studentExternalId || !target.planExternalId
    || String(target.studentExternalId) !== String(studentLink.nazemStudentId)
    || String(target.planExternalId) !== String(planLink.nazemPlanId)
    || JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    throw reviewNazemError('تعذر تثبيت هوية التقييم الأصلية أو تغيّرت محاولاته. النتيجة محفوظة وتحتاج مطابقة قبل الإرسال.', 'NAZEM_SUBMISSION_IDENTITY_CHANGED');
  }
  if (recitations.some(item => item.taskType === 'review' && (
    String(target.source.date || '').slice(0, 10) !== item.taskDate
    || [['surah_from', 'fromSurah'], ['verse_from', 'fromAyah'], ['surah_to', 'toSurah'], ['verse_to', 'toAyah']]
      .some(([sourceKey, taskKey]) => Number(target.source[sourceKey]) !== Number(item[taskKey]))
  ))) {
    throw reviewNazemError('تغيّر مقدار المراجعة في ناظم. التقييم محفوظ ويحتاج مطابقة بالسجل الأصلي.', 'NAZEM_SUBMISSION_IDENTITY_CHANGED');
  }
  return target.source;
}

export const hasLocalRecitation = recitations => recitations.some(item => !/^nazem:/.test(String(item.requestId || '')));

export function recitationWriteJournal(connection, job) {
  const persist = async writes => {
    const [result] = await connection.query(
      `UPDATE nazem_sync_jobs SET payload_json = JSON_SET(payload_json, '$.deliveryWrites', CAST(? AS JSON))
       WHERE id = ? AND status = 'syncing' AND lease_owner = ? AND lease_expires_at > NOW(3)`,
      [JSON.stringify(writes), job.id, job.leaseOwner],
    );
    if (!result.affectedRows) throw reviewNazemError('انتهى حجز المزامنة قبل توثيق طلب ناظم.', 'NAZEM_SUBMISSION_LEASE_LOST');
    job.payload.deliveryWrites = writes;
  };
  return {
    before: async path => {
      const writes = job.payload.deliveryWrites || [];
      if (writes.some(write => write.path === path)) {
        throw reviewNazemError('سبق بدء إرسال هذا التقييم. يلزم إثبات نتيجته في ناظم قبل تكرار الإرسال.', 'NAZEM_DELIVERY_UNVERIFIED');
      }
      await persist([...writes, { path, startedAt: new Date().toISOString() }]);
    },
    accepted: async path => {
      await persist((job.payload.deliveryWrites || []).map(write => write.path === path
        ? { ...write, acceptedAt: new Date().toISOString() } : write));
    },
  };
}
