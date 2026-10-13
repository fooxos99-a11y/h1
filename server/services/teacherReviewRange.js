import { selectReviewEnd } from '../../shared/quran-review-cycle.js';

export async function prepareTeacherReviewRange(connection, tasks, cycle, end) {
  let selection;
  try { selection = selectReviewEnd(cycle, end); }
  catch (error) { error.statusCode = 422; throw error; }
  const ordered = [...tasks].sort((a, b) => Number(a.id) - Number(b.id));
  const expectedFaces = cycle.expectedFaces;
  const actualEnd = selection.ranges.at(-1).end;
  const state = selection.faces < expectedFaces ? 'partial' : selection.faces > expectedFaces ? 'extra' : 'complete';
  for (const task of ordered) {
    const reviewExecution = task.id === ordered[0].id
      ? { ...selection, expectedFaces }
      : { faces: 0, ranges: [], anchorId: ordered[0].id };
    await connection.query(`UPDATE student_quran_tasks SET review_execution_json = ?,
      actual_to_page = ?, actual_to_surah = ?, actual_to_ayah = ?, execution_state = ?
      WHERE id = ? AND student_id = ?`,
    [JSON.stringify(reviewExecution), actualEnd.page, actualEnd.surah, actualEnd.ayah, state, task.id, task.studentId]);
    task.reviewExecution = JSON.stringify(reviewExecution);
    Object.assign(task, { actualToPage: actualEnd.page, actualToSurah: actualEnd.surah, actualToAyah: actualEnd.ayah, executionState: state });
  }
  return { tasks: ordered, actualEnd };
}

export async function loadPreparedRecitationTasks(connection, taskIds) {
  const [rows] = await connection.query(`SELECT t.id, t.plan_id AS planId, t.student_id AS studentId,
    DATE_FORMAT(t.task_date, '%Y-%m-%d') AS taskDate, t.task_type AS taskType, t.track,
    t.from_page AS fromPage, t.from_surah AS fromSurah, t.from_ayah AS fromAyah,
    t.to_page AS toPage, t.to_surah AS toSurah, t.to_ayah AS toAyah,
    t.target_pages AS targetPages, t.actual_to_page AS actualToPage,
    t.actual_to_surah AS actualToSurah, t.actual_to_ayah AS actualToAyah,
    t.review_execution_json AS reviewExecution, t.execution_state AS executionState,
    p.plan_version AS planVersion, qsf.name_arabic AS fromSurahName, qst.name_arabic AS toSurahName
    FROM student_quran_tasks t JOIN student_quran_plans p ON p.id = t.plan_id
    LEFT JOIN quran_surahs qsf ON qsf.surah_number = t.from_surah
    LEFT JOIN quran_surahs qst ON qst.surah_number = t.to_surah
    WHERE t.id IN (${taskIds.map(() => '?').join(',')})`, taskIds);
  return rows.map(row => ({ ...row, targetPages: Number(row.targetPages) }));
}
