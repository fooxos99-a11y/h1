import { reviewStartFromHistory } from './quranReviewSchedule.js';

const positionKey = (page, surah, ayah) => Number(page) * 1_000_000 + Number(surah) * 1000 + Number(ayah);

/** Compile the same page/surah/ayah ordering as the original range predicate. */
export function compileQuranRanges(ranges) {
  const sorted = ranges.map(range => {
    const first = positionKey(range.startPage, range.startSurah, range.startAyah);
    const last = positionKey(range.endPage, range.endSurah, range.endAyah);
    return [Math.min(first, last), Math.max(first, last)];
  }).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1]);
    else merged.push([...range]);
  }
  return ayah => {
    const value = positionKey(ayah.page, ayah.surah, ayah.ayah);
    let low = 0, high = merged.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (merged[middle][0] <= value) low = middle + 1;
      else high = middle;
    }
    return low > 0 && value <= merged[low - 1][1];
  };
}

/** Request-owned history: read only assigned students once, preserving each historical cutoff. */
export async function loadTeacherReviewHistory(connection, rows, { acceptedSql, expandRange, ayahs }) {
  const studentIds = [...new Set(rows.filter(row => row.taskType === 'review' && !Number(row.nazemManaged)).map(row => Number(row.studentId)))];
  if (!studentIds.length) return null;
  const slots = studentIds.map(() => '?').join(',');
  const [prior] = await connection.query(`SELECT student_id AS studentId, start_surah AS startSurah,
    start_ayah AS startAyah, start_page AS startPage, end_surah AS endSurah, end_ayah AS endAyah, end_page AS endPage
    FROM student_quran_plan_prior_memorization WHERE student_id IN (${slots})
    UNION ALL SELECT student_id AS studentId, start_surah AS startSurah, start_ayah AS startAyah,
    start_page AS startPage, end_surah AS endSurah, end_ayah AS endAyah, end_page AS endPage
    FROM student_quran_prior_memorization WHERE student_id IN (${slots})`, [...studentIds, ...studentIds]);
  const [completed] = await connection.query(`SELECT id, student_id AS studentId,
    DATE_FORMAT(task_date, '%Y-%m-%d') AS taskDate, from_surah AS startSurah, from_ayah AS startAyah, from_page AS startPage,
    COALESCE(actual_to_surah,to_surah) AS endSurah, COALESCE(actual_to_ayah,to_ayah) AS endAyah,
    COALESCE(actual_to_page,to_page) AS endPage FROM student_quran_tasks
    WHERE student_id IN (${slots}) AND task_type='memorization' AND ${acceptedSql}
      AND from_surah IS NOT NULL AND from_ayah IS NOT NULL AND to_surah IS NOT NULL AND to_ayah IS NOT NULL
    ORDER BY from_page, from_surah, from_ayah`, studentIds);
  const [history] = await connection.query(`SELECT id, student_id AS studentId, plan_id AS planId,
    DATE_FORMAT(task_date, '%Y-%m-%d') AS taskDate, task_type AS taskType,
    from_page AS fromPage, to_page AS toPage, actual_to_page AS actualToPage,
    actual_to_surah AS actualToSurah, actual_to_ayah AS actualToAyah,
    teacher_completed AS teacherCompleted, student_status AS studentStatus, executed_at AS executedAt,
    review_execution_json AS reviewExecution, execution_state AS executionState,
    from_page AS startPage, from_surah AS startSurah, from_ayah AS startAyah,
    to_page AS endPage, to_surah AS endSurah, to_ayah AS endAyah
    FROM student_quran_tasks WHERE student_id IN (${slots}) AND task_type IN ('review','link')
    ORDER BY task_date, from_page, id`, studentIds);
  const expanded = await Promise.all(completed.map(async row => ({ ...row, ranges: await expandRange(row) })));
  const boundaries = new Map(ayahs.map(ayah => [Number(ayah.page), ayah]));
  for (const row of history) {
    const end = boundaries.get(Number(row.actualToPage));
    row.actualCompletesPage = Boolean(end && Number(row.actualToSurah) === Number(end.surah) && Number(row.actualToAyah) === Number(end.ayah));
  }
  const byStudent = new Map(studentIds.map(id => [id, {
    prior: prior.filter(row => Number(row.studentId) === id),
    completed: expanded.filter(row => Number(row.studentId) === id),
    history: history.filter(row => Number(row.studentId) === id),
  }]));
  return {
    ayahs,
    forDate(plan, date) {
      const selected = byStudent.get(Number(plan.studentId));
      const reviews = selected.history.filter(row => row.taskType === 'review' && Number(row.planId) === Number(plan.id) && row.taskDate < date);
      const latestReview = reviews.filter(row => row.studentStatus === 'done' || row.teacherCompleted != null)
        .sort((a, b) => b.taskDate.localeCompare(a.taskDate) || Number(a.id) - Number(b.id))[0] || null;
      return {
        saved: [...selected.prior, ...selected.completed.filter(row => row.taskDate < date).flatMap(row => row.ranges)],
        links: selected.history.filter(row => row.taskType === 'link' && row.taskDate === date),
        latestReview,
        fallbackPage: reviewStartFromHistory(reviews, plan.startPage),
      };
    },
  };
}
