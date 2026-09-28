import { isNazemFollowUpCompleted } from '../../shared/nazem-integration.js';
import { setQuranTaskGroupReward } from './quranTaskRewards.js';
import { calculateEvaluatedGroupReward, loadRecitationRewardSettings } from './recitationRewards.js';

// An explicit administrative repair uses the recorded historical entitlement,
// never today's prices. The regular activation boundary remains unchanged.
export function historicalPointRecoveryPlan(daily, tasks, ledger) {
  const skip = reason => ({ eligible: false, reason, dailyId: daily?.id });
  if (!daily || daily.status !== 'requires_review' || daily.syncStatus !== 'synced'
    || !daily.activationDate || daily.taskDate >= daily.activationDate) return skip('not_historical_review');
  if (!isNazemFollowUpCompleted(daily.remoteStatus) || !/^[1-9][0-9]*$/.test(String(daily.remoteRecordId || ''))
    || daily.remoteDate !== daily.taskDate) return skip('remote_unconfirmed');
  const primary = tasks.filter(task => task.taskType === daily.taskType && task.track === daily.track);
  if (!primary.length || tasks.some(task => task.taskType !== 'repeat'
    && (!task.evaluatedAt || Number(task.teacherCompleted) !== 1))) {
    return skip('incomplete_evaluation');
  }
  const expected = Number(daily.expectedPoints);
  const recorded = Number(daily.recordedPoints);
  if (daily.expectedPoints == null || daily.recordedPoints == null
    || !Number.isSafeInteger(expected) || !Number.isSafeInteger(recorded)
    || expected <= recorded || recorded < 0) return skip('no_recorded_shortfall');
  const current = tasks.reduce((sum, task) => sum + Number(task.points || 0), 0);
  if (current !== recorded || Number(ledger) !== recorded) return skip('changed_ledger');
  return { eligible: true, dailyId: daily.id, studentId: daily.studentId,
    taskIds: tasks.map(task => Number(task.id)), expected, recorded, delta: expected - recorded };
}

export function historicalLinkPointRecoveryPlan(daily, tasks, ledger) {
  const links = tasks.filter(task => task.taskType === 'link');
  const delta = calculateEvaluatedGroupReward(links);
  const current = tasks.reduce((sum, task) => sum + Number(task.points || 0), 0);
  // Recover an independently graded link without changing a failed memorization
  // or undoing a later correction to the repetition reward.
  if (daily?.taskType !== 'memorization' || daily.track !== 'memorization'
    || daily.expectedPoints == null || daily.recordedPoints == null
    || !links.length || links.some(task => Number(task.points) !== 0)
    || !Number.isSafeInteger(delta) || delta <= 0
    || Number(daily.expectedPoints) - Number(daily.recordedPoints) !== delta
    || daily.remoteLinkCount == null || !Number.isFinite(Number(daily.remoteLinkCount))
    || links.reduce((sum, task) => sum + Number(task.actualLinkCount || 0), 0) !== Number(daily.remoteLinkCount)
    || current !== Number(ledger)) return { eligible: false, reason: 'link_entitlement_unconfirmed', dailyId: daily?.id };
  const checked = historicalPointRecoveryPlan({ ...daily, taskType: 'link', expectedPoints: delta, recordedPoints: 0 }, links, 0);
  return checked.eligible ? { ...checked, dailyTotal: current + delta } : checked;
}

export async function recoverHistoricalNazemPoints(connection, dailyId, { apply = false, linkOnly = false } = {}) {
  await connection.beginTransaction();
  try {
    const [[identity]] = await connection.query('SELECT ruwasi_student_id AS studentId FROM nazem_daily_follow_up_links WHERE id = ?', [dailyId]);
    if (!identity) { await connection.rollback(); return { eligible: false, reason: 'missing_day', dailyId }; }
    await connection.query('SELECT id FROM students WHERE id = ? FOR UPDATE', [identity.studentId]);
    const [[daily]] = await connection.query(`SELECT d.id, d.ruwasi_student_id AS studentId, d.ruwasi_plan_id AS planId,
      d.teacher_id AS teacherId, DATE_FORMAT(d.follow_up_date, '%Y-%m-%d') AS taskDate,
      d.task_type AS taskType, d.track, d.sync_status AS syncStatus,
      JSON_UNQUOTE(JSON_EXTRACT(d.remote_snapshot, '$.status')) AS remoteStatus,
      JSON_UNQUOTE(JSON_EXTRACT(d.remote_snapshot, '$.id')) AS remoteRecordId,
      JSON_UNQUOTE(JSON_EXTRACT(d.remote_snapshot, '$.link')) AS remoteLinkCount,
      LEFT(JSON_UNQUOTE(JSON_EXTRACT(d.remote_snapshot, '$.date')), 10) AS remoteDate,
      work.status, work.expected_points AS expectedPoints, work.recorded_points AS recordedPoints,
      (SELECT setting_value FROM app_settings WHERE setting_key = 'nazemPointsStartDate') AS activationDate
      FROM nazem_daily_follow_up_links d JOIN nazem_point_reconciliations work ON work.daily_follow_up_id = d.id
      WHERE d.id = ? FOR UPDATE`, [dailyId]);
    if (!daily) { await connection.rollback(); return { eligible: false, reason: 'missing_entitlement', dailyId }; }
    const types = daily.taskType === 'memorization' ? ['memorization', 'repeat', ...(daily.track === 'memorization' ? ['link'] : [])] : ['review'];
    const [tasks] = await connection.query(`SELECT id, task_type AS taskType, track, points,
      teacher_completed AS teacherCompleted, evaluated_at AS evaluatedAt,
      evaluation_score AS evaluationScore, actual_link_count AS actualLinkCount
      FROM student_quran_tasks WHERE student_id = ? AND plan_id = ? AND task_date = ? AND track = ?
      AND task_type IN (?) ORDER BY (task_type = ?) DESC, id FOR UPDATE`,
    [daily.studentId, daily.planId, daily.taskDate, daily.track, types, daily.taskType]);
    const [[ledger]] = await connection.query(`SELECT COALESCE(SUM(CASE WHEN transaction_type = 'increase' THEN points ELSE -points END), 0) AS total
      FROM student_point_transactions WHERE student_id = ? AND source_type IN ('quran_plan','quran_execution','quran_evaluation')
      AND source_id IN (?)`, [daily.studentId, tasks.length ? tasks.map(task => task.id) : [0]]);
    const plan = linkOnly ? historicalLinkPointRecoveryPlan(daily, tasks, ledger.total)
      : historicalPointRecoveryPlan(daily, tasks, ledger.total);
    if (!apply || !plan.eligible) { await connection.rollback(); return plan; }
    if (linkOnly) {
      const [[linkLedger]] = await connection.query(`SELECT COALESCE(SUM(CASE WHEN transaction_type = 'increase' THEN points ELSE -points END), 0) AS total
        FROM student_point_transactions WHERE student_id = ? AND source_type IN ('quran_plan','quran_execution','quran_evaluation')
        AND source_id IN (?)`, [daily.studentId, plan.taskIds]);
      if (Number(linkLedger.total) !== 0) { await connection.rollback(); return { ...plan, eligible: false, reason: 'changed_link_ledger' }; }
    }
    const settings = await loadRecitationRewardSettings(connection);
    if (!settings.pointsSystemEnabled) { await connection.rollback(); return { ...plan, eligible: false, reason: 'points_disabled' }; }
    await setQuranTaskGroupReward(connection, {
      taskIds: plan.taskIds, studentId: daily.studentId, targetPoints: plan.expected, settings, date: daily.taskDate,
      actorRole: 'system', actorName: 'مزامنة ناظم', supervisorId: daily.teacherId, sourceType: 'quran_evaluation',
      reason: 'استعادة استحقاق نقاط ناظم التاريخي الموثق', dedupeKey: `nazem_historical_recovery:${daily.id}`,
    });
    await connection.query(`UPDATE nazem_point_reconciliations SET status = 'synced', expected_points = ?, recorded_points = ?,
      last_error = NULL, checked_at = NOW(3) WHERE daily_follow_up_id = ?`, [plan.dailyTotal ?? plan.expected, plan.dailyTotal ?? plan.expected, dailyId]);
    await connection.commit();
    return { ...plan, applied: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}
