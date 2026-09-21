const retryableStatuses = new Set(['failed', 'blocked', 'requires_review']);
export const nazemSyncStatusLabel = (code, needsRecheck = false) => needsRecheck && code === 'NAZEM_PLAN_STUDENT_MISMATCH'
  ? 'تسميع سابق ينتظر التحقق من ناظم' : ({
  NAZEM_FOLLOW_UP_STUDENT_MISSING: 'الطالب غير ظاهر في متابعة ناظم',
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

export const nazemIssueMessage = (issue) => {
  if (issue?.errorCode === 'NAZEM_FOLLOW_UP_STUDENT_MISSING') {
    return 'الطالب موجود في خطة ناظم لكنه غير ظاهر في متابعة هذا التاريخ. راجع المتابعة في ناظم ثم أعد المزامنة؛ التسميع محفوظ.';
  }
  if (issue?.errorCode === 'NAZEM_PLAN_STUDENT_MISMATCH') {
    return 'تعذرت مطابقة الطالب مع متابعة ناظم. أعد التحقق من المجموعة والمتابعة قبل تغيير الربط؛ التسميع المحفوظ باقٍ.';
  }
  return issue?.message || 'تعذرت المزامنة مع ناظم.';
};
