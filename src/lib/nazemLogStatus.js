export function nazemLogStatus(entry) {
  if (entry?.status === 'synced') {
    if (entry.latePending) return 'المتأخر لم يكتمل';
    if (entry.resultStatus === 'not_completed') return entry.taskType === 'link' ? 'سُجل: لم يربط' : 'سُجل: لم يحفظ';
    if (entry.authoritative || entry.alreadyRecorded) return 'مؤكد في ناظم';
    if (entry.operationType?.startsWith('account.')) return 'اكتمل التحديث';
    return 'أُرسل إلى ناظم';
  }
  if (entry?.status === 'failed' && entry.operationType?.startsWith('account.')) return 'تعذر التحديث';
  if (entry?.status === 'syncing' && entry.operationType?.startsWith('account.')) return 'جارٍ التحديث';
  return ({ pending: 'قيد الانتظار', syncing: 'جارٍ الإرسال', retrying: 'إعادة المحاولة',
    blocked: 'معلّق', failed: 'تعذر الإرسال', requires_review: 'يحتاج مراجعة',
    conflict: 'تعارض', dismissed: 'مغلق' })[entry?.status] || 'يحتاج مراجعة';
}

export const nazemLogConfirmed = entry => entry?.status === 'synced' && !entry.latePending;
