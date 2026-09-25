import { buildReviewCycle, parseReviewExecution, selectReviewFaces } from '../../shared/quran-review-cycle.js';

export async function loadReviewCycle({ connection, plan, date, rows, ayahs, isAvailable, fallbackPage }) {
  const direction = Number(plan.startSurah) > Number(plan.endSurah) ? -1 : 1;
  const [[history]] = await connection.query(`SELECT review_execution_json AS reviewExecution,
    teacher_completed AS teacherCompleted FROM student_quran_tasks
    WHERE plan_id = ? AND task_type = 'review' AND task_date < ? AND (student_status = 'done' OR teacher_completed IS NOT NULL)
    ORDER BY task_date DESC, id ASC LIMIT 1`, [plan.id, date]);
  const prior = parseReviewExecution(history?.reviewExecution);
  const ordered = ayahs.filter(isAvailable).sort((a, b) => direction < 0 ? b.surah - a.surah || a.ayah - b.ayah : a.surah - b.surah || a.ayah - b.ayah);
  const start = prior ? (history.teacherCompleted != null && Number(history.teacherCompleted) !== 1 ? prior.ranges[0].start : prior.next)
    : ordered.find(ayah => direction < 0 ? ayah.page <= fallbackPage : ayah.page >= fallbackPage) || ordered[0];
  const cycle = buildReviewCycle({ ayahs, isAvailable, start, direction });
  const expectedFaces = rows.reduce((total, row) => total + Math.max(0.25, Number(row.targetPages) || Math.abs(row.toPage - row.fromPage) + 1), 0);
  return { ...cycle, expectedFaces };
}

export async function saveReviewCycle({ connection, tasks, studentId, status, selection, expectedFaces }) {
  // Every row shares one group outcome. Only the anchor owns the ordered path.
  const ordered = [...tasks].sort((a, b) => Number(a.id) - Number(b.id));
  const anchor = ordered[0];
  const state = status !== 'done' ? null : selection.faces < expectedFaces ? 'partial' : selection.faces > expectedFaces ? 'extra' : 'complete';
  for (const task of ordered) {
    const end = status === 'done' ? selection.ranges.at(-1).end : null;
    await connection.query(`UPDATE student_quran_tasks SET student_status = ?, execution_state = ?,
      actual_to_page = ?, actual_to_surah = ?, actual_to_ayah = ?, review_execution_json = ?,
      executed_at = IF(? = 'done', CURRENT_TIMESTAMP, NULL), execution_actor_role = 'student'
      WHERE id = ? AND student_id = ?`, [status, state, end?.page || null, end?.surah || null, end?.ayah || null,
      status === 'done' ? JSON.stringify(task.id === anchor.id ? { ...selection, expectedFaces } : { faces: 0, ranges: [], anchorId: anchor.id }) : null, status, task.id, studentId]);
  }
}

export function selectAuthorizedReview(cycle, amount, editable) {
  const faces = Number(amount);
  if (!editable && Math.abs(faces - cycle.expectedFaces) > 1e-8) throw new RangeError('تعديل مقدار المراجعة غير متاح.');
  return selectReviewFaces(cycle, faces);
}
