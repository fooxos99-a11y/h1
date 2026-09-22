const retryableStatuses = new Set(['failed', 'blocked', 'requires_review']);
export const nazemSyncStatusLabel = (code, needsRecheck = false) => needsRecheck && code === 'NAZEM_PLAN_STUDENT_MISMATCH'
  ? 'تسميع سابق ينتظر التحقق من ناظم' : ({
  NAZEM_FOLLOW_UP_STUDENT_MISSING: 'الطالب غير ظاهر في متابعة ناظم',
  NAZEM_STUDENT_INACTIVE: 'الطالب غير مستمر في ناظم',
  NAZEM_PLAN_STUDENT_MISMATCH: 'تحتاج مطابقة الطالب مع ناظم',
  NAZEM_REVIEW_IDENTITY_CONFLICT: 'تحتاج المراجعة مطابقة مع ناظم',
  NAZEM_LINK_WAITING_FOR_MEMORIZATION: 'الربط ينتظر تسجيل الحفظ في ناظم',
}[code] || 'تعذرت المزامنة');
const nonRetryableErrorCodes = new Set([
  'NAZEM_REVISION_RANGE_DISCONNECTED',
  'NAZEM_ATTENDANCE_BLOCKS_RECITATION',
  'NAZEM_ATTENDANCE_SKIPPED',
]);

export const canRetryNazemIssue = (issue) => retryableStatuses.has(issue?.status || 'requires_review')
  && !nonRetryableErrorCodes.has(issue?.errorCode);

export const nazemRetryLabel = issue => issue?.errorCode === 'NAZEM_STUDENT_INACTIVE' ? 'إعادة التحقق من الحالة' : 'إعادة المحاولة';

export const nazemIssueMessage = (issue) => {
  const saved = issue?.operationType === 'attendance.submit' ? 'الحضور محفوظ محليًا' : 'النتيجة محفوظة محليًا';
  if (issue?.errorCode === 'NAZEM_FOLLOW_UP_STUDENT_MISSING') {
    return `الطالب موجود في خطة ناظم لكنه غير ظاهر في متابعة ${issue.taskDate || 'هذا التاريخ'}. ${saved}؛ يلزم التحقق من ظهوره في متابعة ناظم قبل إعادة الإرسال.`;
  }
  if (issue?.errorCode === 'NAZEM_PLAN_STUDENT_MISMATCH') {
    return `تعذرت مطابقة الطالب مع متابعة ناظم. أعد التحقق من المجموعة والمتابعة قبل تغيير الربط؛ ${saved}.`;
  }
  return issue?.message || 'تعذرت المزامنة مع ناظم.';
};
