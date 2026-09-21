import { applyStudentPointDelta, logStudentPointTransaction, syncStudentPointBalance } from './studentPoints.js';

export async function setQuranTaskGroupReward(connection, {
  taskIds,
  studentId,
  targetPoints,
  settings,
  date,
  actorRole,
  actorName,
  supervisorId = null,
  sourceType,
  reason,
  dedupeKey,
}) {
  const ids = [...new Set((taskIds || []).map(Number).filter(Boolean))];
  if (!ids.length) return 0;
  await connection.query('SELECT id FROM students WHERE id = ? FOR UPDATE', [studentId]);
  const placeholders = ids.map(() => '?').join(',');
  const [[current]] = await connection.query(
    `SELECT COALESCE(SUM(points), 0) AS points FROM student_quran_tasks WHERE id IN (${placeholders})`,
    ids,
  );
  const normalizedTarget = Math.max(0, Math.trunc(Number(targetPoints || 0)));
  const currentPoints = Number(current?.points || 0);
  const [[ledger]] = await connection.query(
    `SELECT COALESCE(SUM(CASE WHEN transaction_type = 'increase' THEN points ELSE -points END), 0) AS rewardLedger,
      COALESCE(SUM(CASE WHEN transaction_type = 'increase' AND transaction_date = ? THEN points ELSE 0 END), 0) AS rewardToday
     FROM student_point_transactions
     WHERE student_id = ? AND source_type IN ('quran_plan', 'quran_execution', 'quran_evaluation')
       AND source_id IN (${placeholders})`,
    [date, studentId, ...ids],
  );
  if (Number(ledger.rewardLedger) !== currentPoints) {
    const error = new Error('سجل نقاط التسميع لا يطابق نقاط المهمة. يلزم مراجعة سجل النقاط قبل إعادة الاعتماد.');
    error.statusCode = 409;
    throw error;
  }
  const anchorId = ids[0];
  // Validate against the intact ledger before replacing the previous award.
  const delta = normalizedTarget - currentPoints;
  if (delta) {
    await applyStudentPointDelta(connection, studentId, delta, settings, { date });
  }
  await connection.query(
    `UPDATE student_quran_tasks SET points = CASE WHEN id = ? THEN ? ELSE 0 END WHERE id IN (${placeholders})`,
    [anchorId, normalizedTarget, ...ids],
  );
  await connection.query(
    `DELETE FROM student_point_transactions
     WHERE source_type IN ('quran_plan', 'quran_execution', 'quran_evaluation')
       AND source_id IN (${placeholders})`,
    ids,
  );
  if (normalizedTarget) {
    await logStudentPointTransaction(connection, {
      studentId,
      supervisorId,
      actorRole,
      actorName,
      type: 'increase',
      points: normalizedTarget,
      reason,
      date,
      sourceType,
      sourceId: anchorId,
      dedupeKey,
    });
  } else {
    await syncStudentPointBalance(connection, studentId, settings);
  }
  return delta;
}
