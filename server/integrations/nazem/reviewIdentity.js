import { reviewNazemError } from './errors.js';

export const hasRecitationEvidence = (task) => (
  !['pending', 'not_done'].includes(task.studentStatus)
  || task.teacherCompleted != null || Boolean(task.evaluatedAt || task.executionActorRole)
  || Boolean(task.executedAt || task.actualToSurah || task.actualToAyah || task.actualToPage)
  || Number(task.warningCount || 0) !== 0 || Number(task.mistakeCount || 0) !== 0
  || task.evaluationScore != null
  || ['hasAttempt', 'hasAyahMarks', 'hasWordMarks', 'hasOfflinePart', 'hasNazemResult']
    .some((key) => Number(task[key]) > 0)
);

const sameRange = (task, range) => ['fromSurah', 'fromAyah', 'toSurah', 'toAyah']
  .every((key) => Number(task[key]) === Number(range[key]));

// The caller holds the plan row lock inside its transaction, including on repeat imports.
export async function reconcileNazemReview(connection, plan, date, range, dailyId) {
  const [[identity]] = await connection.query(
    `SELECT id FROM nazem_daily_follow_up_links WHERE id=? AND ruwasi_plan_id=?
      AND ruwasi_student_id=? AND follow_up_date=? AND teacher_id=?
      AND task_type='review' AND track='memorization'`,
    [dailyId, plan.id, plan.studentId, date, plan.teacherId],
  );
  if (!identity) throw reviewNazemError('تعارض في هوية متابعة المراجعة؛ لم تُعدّل مهام الطالب.', 'NAZEM_REVIEW_IDENTITY_CONFLICT');
  const [tasks] = await connection.query(
    `SELECT t.id, t.track, t.nazem_review_id AS nazemReviewId,
      t.from_surah AS fromSurah, t.from_ayah AS fromAyah,
      t.to_surah AS toSurah, t.to_ayah AS toAyah,
      t.student_status AS studentStatus, t.teacher_completed AS teacherCompleted,
      t.evaluated_at AS evaluatedAt, t.execution_actor_role AS executionActorRole,
      t.executed_at AS executedAt, t.actual_to_surah AS actualToSurah,
      t.actual_to_ayah AS actualToAyah, t.actual_to_page AS actualToPage,
      t.warning_count AS warningCount, t.mistake_count AS mistakeCount, t.evaluation_score AS evaluationScore,
      EXISTS (SELECT 1 FROM student_quran_recitation_attempts a WHERE a.task_id=t.id) AS hasAttempt,
      EXISTS (SELECT 1 FROM student_quran_task_ayah_marks a WHERE a.task_id=t.id) AS hasAyahMarks,
      EXISTS (SELECT 1 FROM student_quran_task_word_marks a WHERE a.task_id=t.id) AS hasWordMarks,
      EXISTS (SELECT 1 FROM student_quran_recitation_session_parts a WHERE a.task_id=t.id) AS hasOfflinePart,
      EXISTS (SELECT 1 FROM nazem_recitation_links a WHERE a.ruwasi_task_id=t.id) AS hasNazemResult
     FROM student_quran_tasks t
     WHERE t.plan_id=? AND t.student_id=? AND t.task_date=? AND t.task_type='review'
     ORDER BY t.id FOR UPDATE`, [plan.id, plan.studentId, date],
  );
  const exact = tasks.filter((task) => sameRange(task, range) && task.track === 'memorization');
  const keeper = exact.find(hasRecitationEvidence) || exact[0] || null;
  const conflictingIdentity = tasks.filter((task) => (
    Number(task.nazemReviewId) === Number(dailyId) && task.id !== keeper?.id
  ));
  if (conflictingIdentity.length) await connection.query(
    `UPDATE student_quran_tasks SET nazem_review_id=NULL
     WHERE id IN (${conflictingIdentity.map(() => '?').join(',')})`,
    conflictingIdentity.map((task) => task.id),
  );
  const obsolete = tasks.filter((task) => task.id !== keeper?.id && !hasRecitationEvidence(task));
  if (obsolete.length) await connection.query(
    `DELETE FROM student_quran_tasks WHERE id IN (${obsolete.map(() => '?').join(',')})`,
    obsolete.map((task) => task.id),
  );
  if (keeper && (!keeper.nazemReviewId || keeper.track !== 'memorization')) await connection.query(
    `UPDATE student_quran_tasks SET nazem_review_id=?, track='memorization' WHERE id=?`, [dailyId, keeper.id],
  );
  return {
    keeper,
    preserveExisting: !keeper && tasks.some(hasRecitationEvidence),
    changed: conflictingIdentity.length > 0 || obsolete.length > 0
      || Boolean(keeper && (!keeper.nazemReviewId || keeper.track !== 'memorization')),
  };
}
