import { parseReviewExecution, selectReviewFaces } from '../../shared/quran-review-cycle.js';

/** Freeze the default ordered path too, so a count-only save advances by its full amount. */
export async function ensureDefaultReviewExecution(connection, task, getCycle) {
  if (Number(task.nazemManaged) || task.taskType !== 'review' || task.reviewExecution) return;
  const [rows] = await connection.query(`SELECT id, target_pages AS targetPages, from_page AS fromPage,
    to_page AS toPage, review_execution_json AS reviewExecution, teacher_completed AS teacherCompleted
    FROM student_quran_tasks WHERE plan_id=? AND student_id=? AND task_date=?
      AND task_type='review' AND track=? ORDER BY id FOR UPDATE`,
  [task.planId, task.studentId, task.taskDate, task.track || 'memorization']);
  if (!rows.length || rows.some(row => row.teacherCompleted != null)) return;
  const existing = rows.find(row => parseReviewExecution(row.reviewExecution));
  let selection = existing && parseReviewExecution(existing.reviewExecution);
  if (!selection) {
    const cycle = await getCycle(rows);
    if (!cycle?.ayahs.length) throw Object.assign(new Error('لا يوجد محفوظ متاح للمراجعة.'), { statusCode: 422 });
    selection = { ...selectReviewFaces(cycle, cycle.expectedFaces), expectedFaces: cycle.expectedFaces };
  }
  const anchorId = existing?.id || rows[0].id;
  for (const row of rows) {
    const value = row.id === anchorId ? selection : { faces: 0, ranges: [], anchorId };
    await connection.query('UPDATE student_quran_tasks SET review_execution_json=? WHERE id=? AND student_id=?',
      [JSON.stringify(value), row.id, task.studentId]);
    if (Number(row.id) === Number(task.id)) task.reviewExecution = JSON.stringify(value);
  }
}
