import { syncStudentPointBalance } from './studentPoints.js';

export function planPracticeRewardCorrection(tasks) {
  const groups = new Map();
  for (const task of tasks) {
    const key = [task.studentId, task.planId, task.taskDate, task.track].join(':');
    const group = groups.get(key) || [];
    group.push(task);
    groups.set(key, group);
  }
  return [...groups.entries()].flatMap(([key, rows]) => {
    const current = rows.reduce((sum, row) => sum + Number(row.points || 0), 0);
    // Reprice existing awards; do not infer eligibility from imported counts.
    if (!current) return [];
    const repeat = rows.every(row => Number(row.actualRepeatCount) > 0);
    const listening = rows.every(row => Number(row.actualListeningCount) > 0);
    const target = Number(repeat) * 5 + Number(listening) * 5;
    return [{ key, rows, current, target, delta: target - current }];
  });
}

// Caller owns the transaction and backup. Never changes execution or Nazem state.
export async function correctPracticeRewards(connection, { settings, apply = false } = {}) {
  const [tasks] = await connection.query(`SELECT id, student_id AS studentId, plan_id AS planId,
    DATE_FORMAT(task_date, '%Y-%m-%d') AS taskDate, track, points,
    actual_repeat_count AS actualRepeatCount, actual_listening_count AS actualListeningCount
    FROM student_quran_tasks WHERE task_type = 'repeat' ORDER BY student_id, plan_id, task_date, track, id FOR UPDATE`);
  const corrections = planPracticeRewardCorrection(tasks).filter(group => group.delta);
  const affectedStudents = new Set();
  for (const group of corrections) {
    const first = group.rows[0];
    const ids = group.rows.map(row => row.id);
    await connection.query('SELECT id FROM students WHERE id = ? FOR UPDATE', [first.studentId]);
    const [[ledger]] = await connection.query(`SELECT COALESCE(SUM(IF(transaction_type = 'increase', points, -points)), 0) AS total
      FROM student_point_transactions WHERE student_id = ?
      AND source_type IN ('quran_plan','quran_execution','quran_evaluation') AND source_id IN (${ids.map(() => '?').join(',')})`, [first.studentId, ...ids]);
    if (Number(ledger.total) !== group.current) throw new Error(`Practice ledger mismatch: ${group.key}`);
    if (!apply) continue;
    await connection.query(`INSERT INTO student_point_transactions
      (student_id, actor_role, actor_name, transaction_type, points, reason, transaction_date, source_type, source_id, dedupe_key)
      VALUES (?, 'system', ?, ?, ?, ?, ?, 'quran_evaluation', ?, ?)`,
    [first.studentId, 'تصحيح التكرار والسماع', group.delta > 0 ? 'increase' : 'deduction', Math.abs(group.delta),
      'تصحيح الدرجة إلى 5 للتكرار و5 للسماع', first.taskDate, first.id, `practice-five-v1:${group.key}`]);
    await connection.query(`UPDATE student_quran_tasks SET points = CASE WHEN id = ? THEN ? ELSE 0 END
      WHERE student_id = ? AND id IN (${ids.map(() => '?').join(',')})`, [first.id, group.target, first.studentId, ...ids]);
    affectedStudents.add(first.studentId);
  }
  for (const studentId of affectedStudents) await syncStudentPointBalance(connection, studentId, settings);
  return { groups: corrections.length, students: new Set(corrections.map(group => group.rows[0].studentId)).size,
    before: corrections.reduce((sum, group) => sum + group.current, 0),
    after: corrections.reduce((sum, group) => sum + group.target, 0) };
}
