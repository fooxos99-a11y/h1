import { getBusinessDate } from '../../shared/business-date.js';

export function reconciliationStatus(row) {
  if (!row.dailyId) return 'unlinked';
  if (row.remoteStatus !== 'synced' || !row.remoteRecordId) return row.localAccepted ? 'local_only' : 'unverified';
  if (!row.localAccepted) return 'remote_only';
  if (row.pointsStatus === 'requires_review') return 'points_review';
  if (!row.remoteCheckedAt || !row.pointsCheckedAt || row.pointsStatus !== 'synced' || Number(row.expectedPoints) !== Number(row.recordedPoints)) return 'points_pending';
  return 'matched';
}

export async function loadNazemReconciliationReport(connection, auth, query = {}) {
  const from = String(query.from || getBusinessDate());
  const to = String(query.to || from);
  if (![from, to].every((value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value)
    || from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 31) {
    const error = new Error('اختر فترة صحيحة لا تتجاوز 31 يومًا.'); error.statusCode = 422; throw error;
  }
  if (query.committeeId && query.committeeId !== 'all' && (!Number.isSafeInteger(Number(query.committeeId)) || Number(query.committeeId) <= 0)) {
    const error = new Error('معرّف الحلقة غير صحيح.'); error.statusCode = 422; throw error;
  }
  const params = [from, to];
  const scope = [];
  if (auth.role === 'supervisor') {
    scope.push('daily.teacher_id = ? AND EXISTS (SELECT 1 FROM supervisor_committees sc WHERE sc.supervisor_id = ? AND sc.committee_id = student.committee_id)');
    params.push(auth.id, auth.id);
  }
  if (query.committeeId && query.committeeId !== 'all') {
    scope.push('student.committee_id = ?'); params.push(Number(query.committeeId));
  }
  const [rows] = await connection.query(`SELECT daily.id AS dailyId, student.id AS studentId, student.name AS studentName,
    committee.name AS committeeName, teacher.name AS teacherName, DATE_FORMAT(daily.follow_up_date, '%Y-%m-%d') AS date,
    daily.task_type AS taskType, daily.track, daily.sync_status AS remoteStatus, daily.nazem_record_id AS remoteRecordId,
    daily.last_remote_checked_at AS remoteCheckedAt, work.checked_at AS pointsCheckedAt,
    work.status AS pointsStatus, work.expected_points AS expectedPoints, work.recorded_points AS recordedPoints,
    COALESCE(work.last_error, daily.last_error) AS error,
    JSON_UNQUOTE(JSON_EXTRACT(daily.local_snapshot, '$.importedFromNazem')) AS importedFromNazem,
    EXISTS (SELECT 1 FROM student_quran_recitation_attempts attempt JOIN student_quran_tasks task ON task.id = attempt.task_id
      WHERE attempt.is_official = 1 AND attempt.evaluator_id = daily.teacher_id AND task.plan_id = daily.ruwasi_plan_id AND task.student_id = daily.ruwasi_student_id
        AND task.task_date = daily.follow_up_date AND task.task_type = daily.task_type AND task.track = daily.track) AS localAccepted
    FROM nazem_daily_follow_up_links daily JOIN students student ON student.id = daily.ruwasi_student_id
    JOIN supervisors teacher ON teacher.id = daily.teacher_id LEFT JOIN committees committee ON committee.id = student.committee_id
    LEFT JOIN nazem_point_reconciliations work ON work.daily_follow_up_id = daily.id
    WHERE daily.follow_up_date BETWEEN ? AND ? ${scope.length ? `AND ${scope.join(' AND ')}` : ''}
    ORDER BY daily.follow_up_date DESC, student.name, daily.id LIMIT 2001`, params);
  const missingParams = [];
  const missingScope = [];
  if (auth.role === 'supervisor') { missingScope.push('teacher.id = ?'); missingParams.push(auth.id); }
  if (query.committeeId && query.committeeId !== 'all') { missingScope.push('student.committee_id = ?'); missingParams.push(Number(query.committeeId)); }
  const [unlinked] = await connection.query(`SELECT DISTINCT student.id AS studentId, student.name AS studentName,
    teacher.id AS teacherId, teacher.name AS teacherName, committee.name AS committeeName
    FROM students student JOIN committees committee ON committee.id = student.committee_id
    JOIN supervisor_committees sc ON sc.committee_id = student.committee_id
    JOIN supervisors teacher ON teacher.id = sc.supervisor_id
    JOIN nazem_accounts account ON account.teacher_id = teacher.id AND account.status = 'connected'
    WHERE NOT EXISTS (SELECT 1 FROM nazem_plan_links link WHERE link.ruwasi_student_id = student.id
      AND link.teacher_id = teacher.id AND link.sync_status NOT IN ('deleted','detached'))
    ${missingScope.length ? `AND ${missingScope.join(' AND ')}` : ''} ORDER BY student.name LIMIT 2001`, missingParams);
  const combined = [...rows.slice(0, 2000), ...unlinked.slice(0, 2000).map((row) => ({ ...row, date: to, error: 'لا توجد خطة ناظم مرتبطة؛ لا يمكن إثبات المطابقة.' }))];
  return { from, to, truncated: rows.length > 2000 || unlinked.length > 2000, rows: combined.map((row) => ({
    ...row, status: reconciliationStatus(row), difference: row.expectedPoints == null || row.recordedPoints == null
      ? null : Number(row.expectedPoints) - Number(row.recordedPoints),
  })) };
}
