const fail = (message, statusCode = 422) => Object.assign(new Error(message), { statusCode });

/** Save one batch inside the caller's transaction; the same authorization applies to every row. */
export async function saveManualProgramPointsBatch(connection, { grades, ...context }, dependencies) {
  if (!Array.isArray(grades) || !grades.length || grades.length > 2000
    || grades.some(row => !row || !Number.isSafeInteger(row.studentId) || row.studentId <= 0
      || !Number.isSafeInteger(row.points) || row.points < 0)
    || new Set(grades.map(row => row.studentId)).size !== grades.length) {
    throw fail('قائمة النقاط غير صالحة أو تحتوي طالبًا مكررًا.');
  }
  const results = [];
  for (const grade of [...grades].sort((a, b) => a.studentId - b.studentId)) {
    const result = await saveManualProgramPoints(connection, { ...context, studentId: grade.studentId, points: grade.points }, dependencies);
    results.push({ studentId: grade.studentId, ...result });
  }
  return { grades: results };
}

export async function saveManualProgramPoints(connection, { programId, studentId, points, actor, settings, date }, { applyStudentPointDelta, logStudentPointTransaction }) {
  if (!Number.isSafeInteger(studentId) || studentId <= 0 || !Number.isSafeInteger(programId) || programId <= 0) throw fail('الطالب أو البرنامج غير صالح.');
  const [[program]] = await connection.query('SELECT id, title, points_reward AS pointsReward, (SELECT COUNT(*) FROM learning_paths child WHERE child.parent_path_id = learning_paths.id) AS sectionCount FROM learning_paths WHERE id = ? FOR UPDATE', [programId]);
  if (!program) throw fail('البرنامج غير موجود.', 404);
  if (Number(program.sectionCount)) throw fail('تسجل النقاط لكل قسم بشكل مستقل.');
  const [[questions]] = await connection.query('SELECT COUNT(*) AS count FROM learning_path_questions WHERE path_id = ?', [programId]);
  if (Number(questions.count)) throw fail('التسجيل اليدوي متاح للبرامج بدون أسئلة فقط.');
  if (!Number.isSafeInteger(points) || points < 0 || points > Number(program.pointsReward)) throw fail('النقاط يجب أن تكون بين صفر والحد المحدد للبرنامج.');
  if (!settings.pointsSystemEnabled) throw fail('نظام النقاط غير مفعل.');
  const [[student]] = await connection.query('SELECT id, committee_id AS committeeId FROM students WHERE id = ? FOR UPDATE', [studentId]);
  if (!student) throw fail('الطالب غير موجود.', 404);
  if (actor.role === 'supervisor') {
    const [[scope]] = await connection.query('SELECT 1 AS allowed FROM supervisor_committees WHERE supervisor_id = ? AND committee_id = ? LIMIT 1', [actor.id, student.committeeId]);
    if (!scope) throw fail('يمكنك تسجيل نقاط طلاب حلقاتك فقط.', 403);
  }
  const [[previous]] = await connection.query('SELECT earned_points AS earnedPoints FROM student_path_progress WHERE student_id = ? AND path_id = ? FOR UPDATE', [studentId, programId]);
  const delta = points - Number(previous?.earnedPoints || 0);
  if (delta) {
    await applyStudentPointDelta(connection, studentId, delta, settings, { date });
    await logStudentPointTransaction(connection, { studentId, supervisorId: actor.role === 'supervisor' ? actor.id : null, actorRole: actor.role, actorName: actor.name, type: delta > 0 ? 'increase' : 'deduction', points: Math.abs(delta), reason: `برنامج: ${program.title}`, date, sourceType: 'learning_path', sourceId: programId });
  }
  await connection.query(`INSERT INTO student_path_progress (student_id, path_id, status, score, total_questions, earned_points, completed_at)
    VALUES (?, ?, 'completed', 0, 0, ?, NOW()) ON DUPLICATE KEY UPDATE status = 'completed', score = 0, total_questions = 0, earned_points = VALUES(earned_points), completed_at = NOW()`, [studentId, programId, points]);
  return { earnedPoints: points, awardedPoints: delta };
}
