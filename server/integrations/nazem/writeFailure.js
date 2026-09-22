import { blockedNazemError, reviewNazemError, transientNazemError } from './errors.js';

export function nazemWriteFailure(status, message, cause) {
  if (/إنهاء.*الأيام السابقة|أول يوم معلّق/.test(message)) {
    return Object.assign(blockedNazemError(message, 'NAZEM_PREVIOUS_DAYS_BLOCKING'), { confirmedRejection: status === 422 });
  }
  if (/اليوم غير موجود/.test(message)) {
    return Object.assign(reviewNazemError('سجل اليوم المستهدف لم يعد موجودًا في ناظم. يلزم مطابقة التقييم المحفوظ قبل إعادة إرساله.', 'NAZEM_SAVED_TARGET_CHANGED', cause), { confirmedRejection: status === 422 || status === 404 });
  }
  if ([429, 502, 503, 504].includes(status)) {
    return transientNazemError('تعذر الاتصال بناظم لإرسال العملية. ستتم إعادة المحاولة.', 'NAZEM_FOLLOW_UP_SAVE_UNAVAILABLE', cause);
  }
  if ([401, 419].includes(status)) {
    return reviewNazemError('انتهت جلسة ناظم. أعد التحقق من اتصال حساب المعلم.', 'NAZEM_SESSION_EXPIRED', cause);
  }
  return reviewNazemError(message || 'رفض ناظم حفظ بيانات المتابعة.', 'NAZEM_FOLLOW_UP_SAVE_REJECTED', cause);
}
