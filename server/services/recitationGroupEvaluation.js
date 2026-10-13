import { parseReviewExecution } from '../../shared/quran-review-cycle.js';
import { calculateGroupRecitationOutcome } from '../../shared/recitation-group-evaluation.js';

const invalidGroup = () => Object.assign(new Error('مقاطع التقييم لا تطابق مقدار الجلسة. أعد فتح التسميع.'), { statusCode: 422 });

export async function loadRecitationGroupEvaluation(connection, task, input, policyFor, rangeFaces, mode = 'count', validateWordMarks, rowCounts) {
  if (!input) return null;
  if (Number(task.nazemManaged) || !['memorization', 'link', 'review'].includes(task.taskType)) throw invalidGroup();
  const ids = input.taskIds;
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)
    || new Set(ids).size !== ids.length
    || ![input.warningCount, input.mistakeCount].every(count => Number.isInteger(count) && count >= 0 && count <= 1000)) throw invalidGroup();
  const [groupRows] = await connection.query(`SELECT id, target_pages AS targetPages, review_execution_json AS reviewExecution,
    from_page AS fromPage, from_surah AS fromSurah, from_ayah AS fromAyah,
    to_page AS toPage, to_surah AS toSurah, to_ayah AS toAyah,
    actual_to_page AS actualToPage, actual_to_surah AS actualToSurah, actual_to_ayah AS actualToAyah
    FROM student_quran_tasks WHERE plan_id = ? AND student_id = ? AND task_date = ?
      AND task_type = ? AND track = ? AND nazem_remainder_key = ? FOR UPDATE`,
  [task.planId, task.studentId, task.taskDate, task.taskType, task.track, task.nazemRemainderKey || '']);
  const tasks = task.taskType === 'memorization' ? groupRows.filter(row => ids.includes(Number(row.id))) : groupRows;
  if (tasks.length !== ids.length || tasks.some(row => !ids.includes(Number(row.id))) || !ids.includes(Number(task.id))) throw invalidGroup();
  let warningCount = input.warningCount, mistakeCount = input.mistakeCount;
  if (mode === 'mushaf') {
    if (!input.wordMarksByTask || Object.keys(input.wordMarksByTask).length !== tasks.length || !validateWordMarks) throw invalidGroup();
    const counts = await Promise.all(tasks.map(row => {
      const marks = input.wordMarksByTask[String(row.id)];
      if (!Array.isArray(marks) || marks.length > 1000) throw invalidGroup();
      return validateWordMarks(row, marks);
    }));
    const currentCounts = counts[tasks.findIndex(row => Number(row.id) === Number(task.id))];
    if (rowCounts && (currentCounts.warningCount !== rowCounts.warningCount || currentCounts.mistakeCount !== rowCounts.mistakeCount)) throw invalidGroup();
    warningCount = counts.reduce((sum, count) => sum + count.warningCount, 0);
    mistakeCount = counts.reduce((sum, count) => sum + count.mistakeCount, 0);
    if (warningCount > 1000 || mistakeCount > 1000) throw invalidGroup();
  } else {
    if (input.wordMarksByTask !== undefined) throw invalidGroup();
    const anchorId = Math.min(...ids);
    const expectedWarnings = Number(task.id) === anchorId ? warningCount : 0;
    const expectedMistakes = Number(task.id) === anchorId ? mistakeCount : 0;
    if (rowCounts && (rowCounts.warningCount !== expectedWarnings || rowCounts.mistakeCount !== expectedMistakes)) throw invalidGroup();
  }
  const expectedFaces = tasks.reduce((sum, row) => sum + Math.max(0.25, Number(row.targetPages) || Math.abs(row.toPage - row.fromPage) + 1), 0);
  const actualAmounts = await Promise.all(tasks.map(row => {
    if (row.reviewExecution) return Number(parseReviewExecution(row.reviewExecution)?.faces || 0);
    const completedAssignedRange = Number(row.actualToSurah || row.toSurah) === Number(row.toSurah)
      && Number(row.actualToAyah || row.toAyah) === Number(row.toAyah);
    if (task.taskType === 'review' && completedAssignedRange) return Math.max(0.25, Number(row.targetPages) || Math.abs(row.toPage - row.fromPage) + 1);
    return rangeFaces(connection, { startPage: row.fromPage, startSurah: row.fromSurah, startAyah: row.fromAyah,
      endPage: row.actualToPage || row.toPage, endSurah: row.actualToSurah || row.toSurah, endAyah: row.actualToAyah || row.toAyah });
  }));
  const evaluatedFaces = actualAmounts.reduce((sum, faces) => sum + Number(faces || 0), 0);
  if (!(evaluatedFaces > 0)) throw invalidGroup();
  const policy = policyFor({ ...task, evaluatedFaces });
  return { ...calculateGroupRecitationOutcome({ policy, taskType: task.taskType, evaluatedFaces, expectedFaces,
    warningCount, mistakeCount }), evaluatedFaces, policy };
}
