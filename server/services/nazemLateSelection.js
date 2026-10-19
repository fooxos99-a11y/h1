import { nazemLateOptions } from '../../shared/nazem-late-selection.js';
import { isNazemFollowUpCompleted } from '../../shared/nazem-integration.js';
import { isCurrentNazemSession } from '../integrations/nazem/scheduleAuthority.js';
import { nazemTaskRangeSql } from '../integrations/nazem/taskRange.js';

/**
 * A newer Nazem memorization cannot be saved while an older late of the same plan and track is
 * still open and not part of this batch: Nazem takes lates first, so the save goes to the oldest late.
 */
export function skipsOpenNazemLate(owned, lateRows, selected, sessionDate) {
  const selectedIds = new Set(selected.map(row => Number(row.id)));
  const openLates = lateRows.filter(row => !Number(row.completed) && !selectedIds.has(Number(row.id))
    && row.availableOn === sessionDate && !isNazemFollowUpCompleted(row.remoteStatus));
  return owned.some(task => Number(task.nazemManaged) && !Number(task.sameSession)
    && task.taskType === 'memorization' && !selectedIds.has(Number(task.id))
    && openLates.some(late => Number(late.planId) === Number(task.planId) && late.track === task.track
      && String(late.taskDate) < String(task.taskDate)));
}

// Validate the whole batch before any evaluation is written in its transaction.
export async function inspectNazemLateSession(connection, session, teacherId) {
  const reject = (code, message, blocking = null) => ({ valid: false, code, message,
    result: code === 'NAZEM_PREVIOUS_SESSION_BLOCKING' ? 'invalid_sequence' : 'conflict',
    ...(blocking ? { blockedByTaskId: blocking.id, blockedByDate: blocking.taskDate, blockedByTaskType: blocking.taskType || 'memorization' } : {}) });
  const ids = (session.tasks || []).map(item => Number(item.taskId));
  if (!ids.length || ids.some(id => !Number.isSafeInteger(id) || id <= 0)
    || new Set(ids).size !== ids.length) return reject('RECITATION_TASK_INVALID', 'مقاطع جلسة التسميع غير صالحة. بقي التقييم محفوظًا على الجهاز.');
  const [owned] = await connection.query(
    `SELECT t.id, t.student_id AS studentId, t.plan_id AS planId, t.task_type AS taskType, t.track,
      DATE_FORMAT(t.task_date, '%Y-%m-%d') AS taskDate,
      t.from_surah AS fromSurah, t.from_ayah AS fromAyah, t.to_surah AS toSurah, t.to_ayah AS toAyah,
      EXISTS (SELECT 1 FROM nazem_plan_links p
        JOIN nazem_accounts account ON account.teacher_id = p.teacher_id AND account.status = 'connected'
        JOIN app_settings setting ON setting.setting_key = 'nazemIntegrationEnabled' AND setting.setting_value = 'true'
        WHERE p.ruwasi_plan_id = t.plan_id
        AND p.ruwasi_student_id = t.student_id AND p.sync_status NOT IN ('deleted','detached')) AS nazemManaged,
      EXISTS (SELECT 1 FROM student_quran_recitation_attempts a WHERE a.task_id = t.id
        AND a.is_official = 1 AND a.request_id = CONCAT(?, ':', t.id)) AS sameSession
     FROM student_quran_tasks t
     JOIN students s ON s.id = t.student_id
     WHERE t.id IN (${ids.map(() => '?').join(',')})
       AND EXISTS (SELECT 1 FROM supervisor_committees sc
         WHERE sc.committee_id = s.committee_id AND sc.supervisor_id = ?)`,
    [session.sessionId || '', ...ids, teacherId],
  );
  if (owned.length !== ids.length || owned.some(row => Number(row.studentId) !== Number(session.studentId))) {
    return reject('RECITATION_TASK_UNAVAILABLE', 'لم تعد بعض مقاطع الجلسة متاحة لهذا الحساب. بقي التقييم محفوظًا؛ حدّث الجلسة.');
  }
  if (owned.some(row => {
    const submitted = session.tasks.find(item => Number(item.taskId) === Number(row.id));
    return submitted.planId && Number(submitted.planId) !== Number(row.planId);
  })) return reject('RECITATION_PLAN_CHANGED', 'تغيّرت خطة الطالب. بقي التقييم السابق محفوظًا للمراجعة.');
  // Unlinking retains daily history. Those snapshots cannot impose remote ordering on local work.
  if (owned.every(row => !Number(row.nazemManaged))) return { valid: true };
  const [rows] = await connection.query(
    `SELECT t.id, t.plan_id AS planId, t.student_id AS studentId,
      t.task_type AS taskType, t.track, DATE_FORMAT(t.task_date, '%Y-%m-%d') AS taskDate,
      t.from_surah AS fromSurah, t.from_ayah AS fromAyah,
      t.to_surah AS toSurah, t.to_ayah AS toAyah, t.to_page AS toPage,
      surah.ayah_count AS toSurahAyahCount,
      JSON_UNQUOTE(JSON_EXTRACT(d.remote_snapshot, '$.nazemLateAvailableOn')) AS availableOn,
      JSON_UNQUOTE(JSON_EXTRACT(d.remote_snapshot, '$.status')) AS remoteStatus,
      EXISTS (SELECT 1 FROM student_quran_recitation_attempts a WHERE a.task_id = t.id
        AND a.is_official = 1 AND a.request_id = CONCAT(?, ':', t.id)) AS sameSession,
      EXISTS (SELECT 1 FROM student_quran_recitation_attempts a WHERE a.task_id = t.id
        AND a.is_official = 1 AND a.teacher_completed = 1) AS completed,
      1 AS nazemLate
     FROM student_quran_tasks t
     JOIN nazem_daily_follow_up_links d ON d.ruwasi_plan_id = t.plan_id
       AND d.ruwasi_student_id = t.student_id AND d.follow_up_date = t.task_date
       AND d.task_type = t.task_type AND d.track = t.track
     LEFT JOIN quran_surahs surah ON surah.surah_number = t.to_surah
     WHERE t.student_id = ? AND d.teacher_id = ? AND t.task_type = 'memorization'
       AND JSON_UNQUOTE(JSON_EXTRACT(d.remote_snapshot, '$.nazemLate')) = 'true'
       AND ${nazemTaskRangeSql('t', 'd')}
     ORDER BY t.task_date, t.id FOR UPDATE`,
    [session.sessionId, Number(session.studentId), teacherId],
  );
  const selected = ids.map(id => rows.find(row => Number(row.id) === id)).filter(Boolean);
  if (owned.some(row => Number(row.nazemManaged) && !Number(row.sameSession))) {
    const [authorities] = await connection.query(
      `SELECT ruwasi_plan_id AS planId, task_type AS taskType, track,
        DATE_FORMAT(follow_up_date, '%Y-%m-%d') AS sourceDate,
        JSON_UNQUOTE(JSON_EXTRACT(remote_snapshot, '$.status')) AS remoteStatus,
        JSON_UNQUOTE(JSON_EXTRACT(remote_snapshot, '$.nazemActionableDate')) AS taskDate,
        JSON_EXTRACT(remote_snapshot, '$.surah_from') AS fromSurah,
        JSON_EXTRACT(remote_snapshot, '$.verse_from') AS fromAyah,
        JSON_EXTRACT(remote_snapshot, '$.surah_to') AS toSurah,
        JSON_EXTRACT(remote_snapshot, '$.verse_to') AS toAyah
       FROM nazem_daily_follow_up_links WHERE teacher_id = ? AND ruwasi_student_id = ?
         AND JSON_UNQUOTE(JSON_EXTRACT(remote_snapshot, '$.nazemQueueDate')) = ?
       ORDER BY last_remote_checked_at DESC, id DESC`,
      [teacherId, session.studentId, session.sessionDate],
    );
    if (selected.length && !selected.every(row => Number(row.sameSession))) {
      const first = selected[0];
      const authority = authorities.find(row => Number(row.planId) === Number(first.planId)
        && row.taskType === 'memorization' && row.track === first.track);
      if (authority?.taskDate !== first.taskDate) return reject('NAZEM_SESSION_CHANGED', 'تغيّر المقطع المتاح في ناظم. حدّث الجلسة؛ التقييم السابق محفوظ.');
    }
    if (!isCurrentNazemSession(owned, authorities, selected.map(row => row.id))) return reject('NAZEM_SESSION_CHANGED', 'تغيّر المقطع المتاح في ناظم. حدّث الجلسة؛ التقييم السابق محفوظ.');
  }
  if (skipsOpenNazemLate(owned, rows, selected, session.sessionDate)) {
    const blocking = rows.find(late => !Number(late.completed) && !ids.includes(Number(late.id))
      && late.availableOn === session.sessionDate && !isNazemFollowUpCompleted(late.remoteStatus)
      && owned.some(task => Number(task.planId) === Number(late.planId) && task.track === late.track && late.taskDate < task.taskDate));
    return reject('NAZEM_PREVIOUS_SESSION_BLOCKING', `أكمل الحفظ المتأخر بتاريخ ${blocking?.taskDate || session.sessionDate} أولًا. بقي التقييم محفوظًا.`, blocking);
  }
  if (!selected.length) return { valid: true };
  if (selected.length !== ids.length) return reject('RECITATION_GROUP_CHANGED', 'تغيّرت مقاطع جلسة التسميع. حدّث الجلسة؛ التقييم السابق محفوظ.');
  if (selected.every(row => Number(row.sameSession))) return { valid: true };
  const available = rows.filter(row => !Number(row.completed)
    && row.availableOn === session.sessionDate && !isNazemFollowUpCompleted(row.remoteStatus));
  const first = available.find(row => Number(row.planId) === Number(selected[0].planId)
    && row.track === selected[0].track);
  const options = nazemLateOptions(first, available);
  return ids.every((id, index) => Number(options[index]?.task.id) === id)
    ? { valid: true }
    : reject('NAZEM_PREVIOUS_SESSION_BLOCKING', `أكمل الحفظ المتأخر بتاريخ ${first?.taskDate || session.sessionDate} أولًا. بقي التقييم محفوظًا.`, first);
}

export async function validateNazemLateSession(connection, session, teacherId) {
  return (await inspectNazemLateSession(connection, session, teacherId)).valid;
}
