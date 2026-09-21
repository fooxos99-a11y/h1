import { readNazemLinkCount } from '../../shared/nazem-recitation-policy.js';
import { isNazemFollowUpCompleted } from '../../shared/nazem-integration.js';
import { loadAttendancePointSettings, saveAttendanceWithPoints } from './attendancePoints.js';
import crypto from 'node:crypto';
import { calculateEvaluatedGroupReward, loadRecitationRewardSettings } from './recitationRewards.js';
import { setQuranTaskGroupReward } from './quranTaskRewards.js';
import { calculateStudentExecutionPoints } from './quranPoints.js';
import { calculateSegmentedPlanPoints } from './quranPlanProgress.js';
import { buildRecitationSegmentDetails } from './recitationSegments.js';
import { loadAdjacentQuranPosition } from './quranTraversalIndex.js';
import { compareQuranPositionInDirection } from '../../shared/quran-execution-policy.js';
import { buildNazemLateTaskExistsSql } from '../integrations/nazem/lateTaskScope.js';
import { publicErrorMessage } from './publicErrors.js';

const position = (task, prefix) => ({ page: Number(task[`${prefix}Page`]), surah: Number(task[`${prefix}Surah`]), ayah: Number(task[`${prefix}Ayah`]) });
const getQuranRangeDirection = (start, end) => start.surah !== end.surah ? (start.surah < end.surah ? 1 : -1) : (start.ayah <= end.ayah ? 1 : -1);
const missingRange = () => { const error = new Error('تعذر إثبات مقدار التسميع لاحتساب النقاط.'); error.statusCode = 409; throw error; };

export async function enqueueNazemPointReconciliation(connection, dailyId, snapshot) {
  const hash = crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  await connection.query(`INSERT INTO nazem_point_reconciliations (daily_follow_up_id, source_hash)
    VALUES (?, ?) ON DUPLICATE KEY UPDATE
      status = IF(source_hash <> VALUES(source_hash), 'pending', status),
      source_hash = VALUES(source_hash)`, [dailyId, hash]);
}

async function adjacent(connection, start, direction) {
  if (direction >= 0) return loadAdjacentQuranPosition(connection, start, 'next');
  const [[same]] = await connection.query(`SELECT surah_number AS surah, ayah_number AS ayah, page_number AS page
    FROM quran_ayah_pages WHERE surah_number = ? AND ayah_number > ? ORDER BY ayah_number LIMIT 1`, [start.surah, start.ayah]);
  if (same) return same;
  const [[previous]] = await connection.query(`SELECT surah_number AS surah, ayah_number AS ayah, page_number AS page
    FROM quran_ayah_pages WHERE surah_number < ? ORDER BY surah_number DESC, ayah_number LIMIT 1`, [start.surah]);
  return previous || null;
}

export async function calculateNazemRewardGroups(connection, daily, tasks, settings) {
  const primary = tasks.filter((task) => task.taskType === daily.taskType && task.track === daily.track);
  if (!primary.length || primary.some((task) => !task.evaluatedAt)) {
    const error = new Error('متابعة ناظم لا تطابق مجموعة مهام مقيمة كاملة.'); error.statusCode = 409; throw error;
  }
  let reward = calculateEvaluatedGroupReward(primary);
  const first = primary[0];
  if (daily.taskType === 'memorization' && daily.track === first.planTrack) {
    const direction = getQuranRangeDirection(position(first, 'planStart'), position(first, 'planEnd'));
    const ordered = [...primary].sort((a, b) => compareQuranPositionInDirection(position(a, 'from'), position(b, 'from'), direction));
    const last = ordered.at(-1);
    const end = last.actualToAyah ? position(last, 'actualTo') : position(last, 'to');
    const context = { actualStart: position(ordered[0], 'from'), scheduledEnd: position(last, 'to'), normalEnd: position(last, 'to'), direction };
    const segments = await buildRecitationSegmentDetails(connection, context, end,
      { ...settings, allowQuranCompensation: false, allowQuranExtra: !Number(first.nazemLate) },
      { treatScheduledAsNormal: true, adjacentPosition: adjacent, rangeFaces: missingRange });
    reward = calculateSegmentedPlanPoints({ basePoints: reward, dailyAmount: Number(first.dailyPages || 1), segments,
      compensationPercent: settings.quranCompensationPointsPercent, extraPercent: settings.quranExtraPointsPercent }).total;
  }
  const groups = [{ taskType: daily.taskType, tasks: primary, points: reward }];
  const repeats = tasks.filter((task) => task.taskType === 'repeat' && task.track === daily.track);
  if (daily.taskType === 'memorization' && repeats.length) {
    const repeatReward = calculateStudentExecutionPoints({ taskType: 'memorization', track: daily.track,
      completedRepeatCount: Math.min(...repeats.map((task) => Number(task.actualRepeatCount || 0))), expectedRepeatCount: 30,
      completedListeningCount: Math.min(...repeats.map((task) => Number(task.actualListeningCount || 0))), expectedListeningCount: 1, settings });
    groups.push({ taskType: 'repeat', tasks: repeats, points: primary.every((task) => Number(task.teacherCompleted) === 1) ? repeatReward.total : 0 });
  }
  if (daily.taskType === 'memorization' && daily.track === 'memorization') {
    const links = tasks.filter((task) => task.taskType === 'link');
    if (links.length) {
      const remoteCount = isNazemFollowUpCompleted(daily.remoteResultStatus) ? readNazemLinkCount(daily.remoteLinkCount) : 0;
      if (remoteCount == null || links.some((task) => !task.evaluatedAt)
        || links.reduce((sum, task) => sum + Number(task.actualLinkCount || 0), 0) !== remoteCount) {
        const error = new Error('لم يثبت اكتمال مقدار الربط في ناظم؛ تحتاج نقاطه مراجعة.'); error.statusCode = 409; throw error;
      }
      groups.push({ taskType: 'link', tasks: links, points: calculateEvaluatedGroupReward(links) });
    }
  }
  return groups;
}

// Caller supplies a dedicated connection. Each settlement locks the student and is atomic.
export async function settleNazemPoints(connection, dailyId) {
  await connection.beginTransaction();
  let expected = null;
  let recorded = null;
  let sourceHash = null;
  try {
    const [[identity]] = await connection.query('SELECT ruwasi_student_id AS studentId FROM nazem_daily_follow_up_links WHERE id = ?', [dailyId]);
    if (!identity) { await connection.rollback(); return false; }
    await connection.query('SELECT id FROM students WHERE id = ? FOR UPDATE', [identity.studentId]);
    const [[daily]] = await connection.query(`SELECT d.id, d.ruwasi_student_id AS studentId, d.ruwasi_plan_id AS planId,
      d.teacher_id AS teacherId, DATE_FORMAT(d.follow_up_date, '%Y-%m-%d') AS taskDate, d.task_type AS taskType,
      d.track,
      JSON_UNQUOTE(JSON_EXTRACT(d.remote_snapshot, '$.status')) AS remoteResultStatus,
      JSON_UNQUOTE(JSON_EXTRACT(d.remote_snapshot, '$.link')) AS remoteLinkCount,
      JSON_UNQUOTE(JSON_EXTRACT(d.remote_snapshot, '$.attendanceStatus')) AS attendanceStatus,
      d.sync_status AS syncStatus, work.status, work.source_hash AS sourceHash
      FROM nazem_point_reconciliations work JOIN nazem_daily_follow_up_links d ON d.id = work.daily_follow_up_id
      WHERE d.id = ? FOR UPDATE`, [dailyId]);
    if (!daily || daily.status !== 'pending') { await connection.commit(); return false; }
    sourceHash = daily.sourceHash;
    if (daily.syncStatus !== 'synced') { await connection.commit(); return false; }
    const [[activation]] = await connection.query("SELECT setting_value AS value FROM app_settings WHERE setting_key = 'nazemPointsStartDate'");
    const [tasks] = await connection.query(`SELECT task.id, task.task_type AS taskType, task.track, task.points,
      task.evaluated_at AS evaluatedAt, task.teacher_completed AS teacherCompleted, task.evaluation_score AS evaluationScore,
      task.from_page AS fromPage, task.from_surah AS fromSurah, task.from_ayah AS fromAyah,
      task.to_page AS toPage, task.to_surah AS toSurah, task.to_ayah AS toAyah,
      task.actual_to_page AS actualToPage, task.actual_to_surah AS actualToSurah, task.actual_to_ayah AS actualToAyah,
      task.actual_link_count AS actualLinkCount, task.actual_repeat_count AS actualRepeatCount, task.actual_listening_count AS actualListeningCount,
      ${buildNazemLateTaskExistsSql('task')} AS nazemLate, plan.daily_pages AS dailyPages, plan.track AS planTrack,
      plan.start_page AS planStartPage, plan.start_surah AS planStartSurah, plan.start_ayah AS planStartAyah,
      plan.end_page AS planEndPage, plan.end_surah AS planEndSurah, plan.end_ayah AS planEndAyah
      FROM student_quran_tasks task JOIN student_quran_plans plan ON plan.id = task.plan_id
      WHERE task.plan_id = ? AND task.student_id = ? AND task.task_date = ? AND task.track = ? FOR UPDATE`,
    [daily.planId, daily.studentId, daily.taskDate, daily.track]);
    const settings = await loadRecitationRewardSettings(connection);
    const groups = await calculateNazemRewardGroups(connection, daily, tasks, settings);
    expected = groups.reduce((sum, group) => sum + group.points, 0);
    const ids = groups.flatMap((group) => group.tasks.map((task) => Number(task.id)));
    const [[ledger]] = await connection.query(`SELECT COALESCE(SUM(CASE WHEN transaction_type = 'increase' THEN points ELSE -points END), 0) AS total
      FROM student_point_transactions WHERE student_id = ? AND source_type IN ('quran_plan','quran_execution','quran_evaluation')
        AND source_id IN (${ids.map(() => '?').join(',')})`, [daily.studentId, ...ids]);
    recorded = Number(ledger.total || 0);
    if (!activation?.value || daily.taskDate < activation.value || !settings.pointsSystemEnabled) {
      const error = new Error(!settings.pointsSystemEnabled ? 'نظام النقاط غير مفعّل.' : 'تاريخ الاستحقاق يسبق تفعيل تسوية نقاط ناظم؛ يحتاج مراجعة.');
      error.statusCode = 409; throw error;
    }
    const attendanceStatus = { 2: 'present', 3: 'absent', 4: 'excused', 5: 'late' }[Number(daily.attendanceStatus)];
    if (attendanceStatus) await saveAttendanceWithPoints(connection, { studentId: daily.studentId,
      date: daily.taskDate, status: attendanceStatus, awardNewPoints: true }, await loadAttendancePointSettings(connection));
    const delta = (group) => group.points - group.tasks.reduce((sum, task) => sum + Number(task.points || 0), 0);
    for (const group of [...groups].sort((a, b) => delta(a) - delta(b))) await setQuranTaskGroupReward(connection, {
      taskIds: group.tasks.map((task) => task.id), studentId: daily.studentId, targetPoints: group.points,
      settings, date: daily.taskDate, actorRole: 'system', actorName: 'مزامنة ناظم', supervisorId: daily.teacherId,
      sourceType: 'quran_evaluation', reason: group.taskType === 'repeat' ? 'اعتماد التكرار والسماع من ناظم'
        : group.taskType === 'link' ? 'اعتماد الربط من ناظم'
          : daily.track === 'mastery' ? 'اعتماد الإتقان من ناظم'
            : group.taskType === 'review' ? 'اعتماد المراجعة من ناظم' : 'اعتماد الحفظ من ناظم',
      dedupeKey: `quran_evaluation:${daily.planId}:${daily.taskDate}:${group.taskType}${daily.track === 'mastery' ? ':mastery' : ''}`,
    });
    await connection.query(`UPDATE nazem_point_reconciliations SET status = 'synced', expected_points = ?, recorded_points = ?,
      last_error = NULL, checked_at = NOW(3) WHERE daily_follow_up_id = ?`, [expected, expected, dailyId]);
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    if (![409, 422].includes(Number(error.statusCode))) throw error;
    await connection.query(`UPDATE nazem_point_reconciliations SET status = 'requires_review', expected_points = ?, recorded_points = ?,
      last_error = ?, checked_at = NOW(3) WHERE daily_follow_up_id = ? AND status = 'pending' AND source_hash = ?`,
    [expected, recorded, publicErrorMessage(error).slice(0, 500), dailyId, sourceHash]);
    return false;
  }
}
