const followUpRangeKey = day => [day.date, day.remoteType, day.surah_from, day.verse_from, day.surah_to, day.verse_to].join(':');

export function describeNazemFollowUpIssues(issues) {
  const labels = {
    NAZEM_LOCAL_RESULT_CONFLICT: 'اختلاف النتيجة المحلية عن ناظم',
    NAZEM_REMOTE_DAILY_RANGE_UNMATCHED: 'اختلاف مقدار التسميع',
    NAZEM_STARTED_TASK_RANGE_CHANGED: 'تغيّر مقدار بدأ تسميعه',
    NAZEM_ATTENDANCE_REQUIRES_REVIEW: 'تعذر مطابقة الحضور',
  };
  const reasons = [...new Set(issues.map(issue => labels[issue.code] || 'تعذر إكمال التحديث'))];
  const students = new Set(issues.map(issue => issue.studentId)).size;
  return `تحتاج متابعة ${students} من الطلاب إلى مراجعة: ${reasons.join('، ')}. التقييمات المحلية محفوظة.`;
}

export async function importNazemFollowUpHistory(history, link, {
  applyAttendance, syncScheduled, saveFollowUp,
}) {
  const result = { imported: 0, synced: 0, conflicts: 0, review: 0 };
  const issues = [];
  const issue = (code, day = {}) => issues.push({ code, studentId: link.studentId, taskDate: day.date, taskType: day.taskType });
  const lateKeys = new Set((history.scheduledFollowUps || []).filter(day => day.nazemLate).map(followUpRangeKey));
  for (const attendance of history.attendance || []) {
    if (await applyAttendance(link.studentId, attendance) === false) {
      result.review += 1;
      issue('NAZEM_ATTENDANCE_REQUIRES_REVIEW', attendance);
    }
  }
  for (const day of history.scheduledFollowUps || []) {
    if (day.nazemLate) continue;
    const scheduled = await syncScheduled(link, day);
    if (!scheduled.matched && scheduled.reason === 'task_started') {
      result.review += 1;
      issue('NAZEM_STARTED_TASK_RANGE_CHANGED', day);
    }
  }
  const days = [...(history.followUps || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  for (const day of days) {
    // Do not overwrite a new completion attempt with the old "not completed" result.
    if (day.status === 'not_completed' && lateKeys.has(followUpRangeKey(day))) continue;
    await syncScheduled(link, day);
    const saved = await saveFollowUp(link, day);
    for (const key of Object.keys(result)) result[key] += Number(saved[key] || 0);
    if (saved.review) issue(saved.issueCode || 'NAZEM_FOLLOW_UP_REVIEW', day);
  }
  // Current late_items are authoritative after importing historical outcomes.
  for (const day of (history.scheduledFollowUps || []).filter(day => day.nazemLate)) {
    const scheduled = await syncScheduled(link, day);
    if (!scheduled.matched && scheduled.reason === 'task_started') {
      result.review += 1;
      issue('NAZEM_STARTED_TASK_RANGE_CHANGED', day);
    }
  }
  return issues.length ? { ...result, issues } : result;
}

export async function markNazemFollowUpRefreshSucceeded(connection, teacherId, encryptedSessionState) {
  await connection.query(
    `UPDATE nazem_accounts SET encrypted_session_state = ?, last_verified_at = NOW(3),
      last_successful_login_at = NOW(3), last_error_code = NULL, last_error = NULL
     WHERE teacher_id = ? AND status = 'connected'`,
    [encryptedSessionState, teacherId],
  );
}
