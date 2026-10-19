/** Use accepted progress in this plan, including a save approved earlier today. */
export async function latestApprovedLinkAnchor(connection, plan, date, adjacent, fallback, acceptanceSql = 'teacher_completed = 1') {
  const [[last]] = await connection.query(`SELECT COALESCE(actual_to_page, to_page) AS page,
    COALESCE(actual_to_surah, to_surah) AS surah, COALESCE(actual_to_ayah, to_ayah) AS ayah
    FROM student_quran_tasks WHERE plan_id = ? AND student_id = ? AND track = ?
      AND task_type = 'memorization' AND ${acceptanceSql} AND task_date <= ?
    ORDER BY task_date DESC, COALESCE(evaluated_at, executed_at) DESC, id DESC LIMIT 1`,
  [plan.id, plan.studentId, plan.track || 'memorization', date]);
  return last ? await adjacent(last) || { ...last, ayah: Number(last.ayah) + 1 } : fallback();
}
