import { getBusinessDate } from '../../shared/business-date.js';

export function getManualAttendancePoints(settings, status) {
  if (status === 'present') return Math.max(0, Number(settings.attendancePoints || 0));
  if (status === 'late') return Math.max(0, Number(settings.manualLateAttendancePoints || 0));
  if (status === 'excused') return Math.max(0, Number(settings.excusedAttendancePoints || 0));
  return 0;
}

export async function applyStudentPointDelta(connection, studentId, delta, settings, {
  propagateToFamily = true,
  updateStoreBalance = true,
} = {}) {
  if (!delta) return 0;
  const [[student]] = await connection.query(
    'SELECT points, committee_id AS committeeId FROM students WHERE id = ? FOR UPDATE',
    [studentId]
  );
  if (!student) return 0;

  const currentPoints = Number(student.points || 0);
  const nextPoints = Math.max(0, currentPoints + delta);
  const effectiveDelta = nextPoints - currentPoints;

  await connection.query(
    `
    UPDATE students
    SET points = ?,
        store_balance = CASE WHEN ? THEN GREATEST(0, store_balance + ?) ELSE store_balance END
    WHERE id = ?
    `,
    [nextPoints, updateStoreBalance ? 1 : 0, effectiveDelta, studentId]
  );

  if (propagateToFamily && settings.studentPointsAddToFamily && student.committeeId && effectiveDelta) {
    await connection.query(
      `
      UPDATE committees
      SET
        points = GREATEST(0, points + ?),
        student_points_contribution = GREATEST(0, student_points_contribution + ?)
      WHERE id = ?
      `,
      [effectiveDelta, effectiveDelta, student.committeeId]
    );
  }

  return effectiveDelta;
}

export async function applyAttendancePointDelta(connection, studentId, delta, settings) {
  if (!delta) return 0;
  const [[student]] = await connection.query(
    'SELECT points, committee_id AS committeeId FROM students WHERE id = ? FOR UPDATE',
    [studentId]
  );
  if (!student) return 0;

  const currentPoints = Number(student.points || 0);
  const nextPoints = Math.max(0, currentPoints + delta);
  const effectiveDelta = nextPoints - currentPoints;

  await connection.query(
    `
    UPDATE students
    SET points = ?, store_balance = GREATEST(0, store_balance + ?)
    WHERE id = ?
    `,
    [nextPoints, effectiveDelta, studentId]
  );

  if (settings.studentPointsAddToFamily && student.committeeId && effectiveDelta) {
    await connection.query(
      `
      UPDATE committees
      SET
        points = GREATEST(0, points + ?),
        student_points_contribution = GREATEST(0, student_points_contribution + ?)
      WHERE id = ?
      `,
      [effectiveDelta, effectiveDelta, student.committeeId]
    );
  }

  return effectiveDelta;
}

export async function syncStudentPointBalance(connection, studentId, settings = null) {
  const [[student]] = await connection.query(
    'SELECT points, committee_id AS committeeId FROM students WHERE id = ? FOR UPDATE',
    [studentId]
  );
  if (!student) return 0;

  const [[ledger]] = await connection.query(
    `
    SELECT GREATEST(
      0,
      COALESCE(SUM(CASE WHEN transaction_type = 'increase' THEN points ELSE -points END), 0)
    ) AS total
    FROM student_point_transactions
    WHERE student_id = ?
    `,
    [studentId]
  );

  const currentPoints = Number(student.points || 0);
  const nextPoints = Number(ledger.total || 0);
  const delta = nextPoints - currentPoints;

  await connection.query(
    'UPDATE students SET points = ?, store_balance = GREATEST(0, store_balance + ?) WHERE id = ?',
    [nextPoints, delta, studentId],
  );

  if (settings?.studentPointsAddToFamily && student.committeeId && delta) {
    await connection.query(
      `
      UPDATE committees
      SET
        points = GREATEST(0, points + ?),
        student_points_contribution = GREATEST(0, student_points_contribution + ?)
      WHERE id = ?
      `,
      [delta, delta, student.committeeId]
    );
  }

  return delta;
}

export async function logStudentPointTransaction(connection, {
  studentId,
  supervisorId,
  actorRole = null,
  actorName = null,
  type,
  points,
  reason,
  date,
  sourceType = 'manual',
  sourceId = null,
  dedupeKey = null,
}) {
  if (!points) return;
  const [transaction] = await connection.query(
    `
    INSERT INTO student_point_transactions
      (
        student_id,
        supervisor_id,
        actor_role,
        actor_name,
        transaction_type,
        points,
        reason,
        transaction_date,
        source_type,
        source_id,
        dedupe_key
      )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      supervisor_id = VALUES(supervisor_id),
      actor_role = VALUES(actor_role),
      actor_name = VALUES(actor_name),
      transaction_type = VALUES(transaction_type),
      points = VALUES(points),
      reason = VALUES(reason),
      source_type = VALUES(source_type),
      source_id = VALUES(source_id)
    `,
    [
      studentId,
      supervisorId || null,
      actorRole,
      actorName,
      type,
      points,
      reason,
      date,
      sourceType,
      sourceId,
      dedupeKey,
    ]
  );
  await syncStudentPointBalance(connection, studentId);
  return Number(transaction.insertId || 0);
}

export async function syncStudentFamilyPointsForAttendance(connection, studentId, date, status, settings, context = {}) {
  if (!settings.familyPointsAddToStudents) return;
  const [[student]] = await connection.query(
    'SELECT committee_id AS committeeId FROM students WHERE id = ? FOR UPDATE',
    [studentId]
  );
  if (!student?.committeeId) return;

  const [[awards]] = await connection.query(
    `
    SELECT COALESCE(SUM(points), 0) AS total
    FROM supervisor_family_point_awards
    WHERE committee_id = ? AND award_date = ?
    `,
    [student.committeeId, date]
  );
  const [[transactions]] = await connection.query(
    `
    SELECT COALESCE(SUM(CASE WHEN transaction_type = 'increase' THEN points ELSE -points END), 0) AS total
    FROM student_point_transactions
    WHERE student_id = ? AND transaction_date = ? AND source_type = 'family_evaluation'
    `,
    [studentId, date]
  );
  const desired = status === 'absent' && !settings.familyPointsAddToAbsentStudents
    ? 0
    : Number(awards.total || 0);
  const delta = desired - Number(transactions.total || 0);
  if (!delta) return;

  const effectiveDelta = await applyStudentPointDelta(
    connection,
    studentId,
    delta,
    settings,
    { propagateToFamily: false, date }
  );
  await logStudentPointTransaction(connection, {
    studentId,
    supervisorId: null,
    actorRole: context.actorRole || 'system',
    actorName: context.actorName || 'النظام',
    type: effectiveDelta > 0 ? 'increase' : 'deduction',
    points: Math.abs(effectiveDelta),
    reason: status === 'absent' ? 'إلغاء كيلومترات الحلقة بسبب الغياب' : 'إعادة كيلومترات الحلقة بعد تسجيل الحضور',
    date,
    sourceType: 'family_evaluation',
  });
}
