import { auditDescendingRewards } from './descendingRewardAudit.js';
import { applyStudentPointDelta, logStudentPointTransaction } from './studentPoints.js';

// Caller owns the transaction and must retain an independent pre-change backup.
export async function correctDescendingReward(connection, candidate, rows, settings) {
  const { studentId, planId, date, track } = candidate;
  const dedupeKey = `descending-range-fix:${studentId}:${planId}:${date}:${track}`;
  const [[student]] = await connection.query('SELECT points FROM students WHERE id = ? FOR UPDATE', [studentId]);
  const [[existing]] = await connection.query('SELECT id FROM student_point_transactions WHERE dedupe_key = ?', [dedupeKey]);
  if (existing) return { status: 'already_corrected', studentId, date };
  const verified = (await auditDescendingRewards(rows)).find(item => item.studentId === studentId
    && item.planId === planId && item.date === date && item.track === track);
  if (!verified?.proposedDeduction || verified.recorded !== candidate.recorded
    || verified.correctedPoints !== candidate.correctedPoints
    || JSON.stringify(verified.taskIds) !== JSON.stringify(candidate.taskIds)) throw new Error('Reward evidence changed; correction refused.');
  const [[ledger]] = await connection.query(`SELECT GREATEST(0, COALESCE(SUM(CASE WHEN transaction_type = 'increase'
    THEN points ELSE -points END), 0)) AS total FROM student_point_transactions WHERE student_id = ?`, [studentId]);
  if (!student || Number(student.points) !== Number(ledger.total) || Number(student.points) < verified.proposedDeduction) {
    throw new Error('Student balance requires separate review; correction refused.');
  }
  const ids = verified.taskIds;
  const [locked] = await connection.query(`SELECT id, points FROM student_quran_tasks WHERE student_id = ? AND id IN (${ids.map(() => '?').join(',')}) FOR UPDATE`, [studentId, ...ids]);
  if (locked.length !== ids.length || locked.reduce((sum, task) => sum + Number(task.points), 0) !== verified.recorded) {
    throw new Error('Task points changed; correction refused.');
  }
  await applyStudentPointDelta(connection, studentId, -verified.proposedDeduction, settings);
  await connection.query(`UPDATE student_quran_tasks SET points = CASE WHEN id = ? THEN ? ELSE 0 END
    WHERE student_id = ? AND id IN (${ids.map(() => '?').join(',')})`, [ids[0], verified.correctedPoints, studentId, ...ids]);
  await logStudentPointTransaction(connection, {
    studentId, actorRole: 'admin', actorName: 'تصحيح حساب المقدار', type: 'deduction',
    points: verified.proposedDeduction, reason: `تصحيح زيادة احتساب التسميع: ${verified.recorded} إلى ${verified.correctedPoints}`,
    date, sourceType: 'quran_evaluation', sourceId: ids[0], dedupeKey,
  });
  return { status: 'corrected', studentId, date, deducted: verified.proposedDeduction,
    before: Number(student.points), after: Number(student.points) - verified.proposedDeduction, originalTasks: locked, dedupeKey };
}
