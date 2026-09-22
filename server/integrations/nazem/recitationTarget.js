import { reviewNazemError } from './errors.js';

export const matchesNazemRange = (day, mapped) => Boolean(day
  && Number(day.surah_from) === Number(mapped.fromSurahId)
  && Number(day.verse_from) === Number(mapped.fromAyah)
  && Number(day.surah_to) === Number(mapped.scheduledToSurahId)
  && Number(day.verse_to) === Number(mapped.scheduledToAyah));

export function matchesNazemTarget(day, mapped, queryDate) {
  if (!day?.id) return false;
  const date = String(day.date || day.follow_up_date || '').slice(0, 10);
  if (date && date !== mapped.date) return false;
  if (mapped.nazemSourceDayId) {
    if (String(day.id) !== String(mapped.nazemSourceDayId)) return false;
  } else if ((date || queryDate) !== mapped.date) return false;
  return mapped.taskType === 'link' || matchesNazemRange(day, mapped);
}

// Pending days can be regenerated when Nazem follow-up navigates between dates.
// Recovery requires the original parent cycle: date and passage also repeat across cycles.
export function findRegeneratedPendingDay(items, mapped) {
  const saved = mapped.nazemSavedTarget;
  const matchingType = mapped.taskType === 'review' ? mapped.remoteType === 'revision'
    : mapped.taskType === 'memorization' && ['conserve', 'master'].includes(mapped.remoteType);
  if (!mapped.allowPendingTargetReplacement || !matchingType
    || mapped.nazemLateId || !saved?.id || String(saved.id) !== String(mapped.nazemSourceDayId)
    || saved.status !== 'pending' || String(saved.date || '').slice(0, 10) !== mapped.date
    || !matchesNazemRange(saved, mapped)) return null;
  if (!saved.nazemItemId) return null;
  const reviews = items.filter(item => item.type === mapped.remoteType && String(item.id) === String(saved.nazemItemId));
  if (reviews.length !== 1) return null;
  const item = reviews[0];
  if (item.pending_day || (Array.isArray(item.late_items) && item.late_items.length)) return null;
  if (item.is_blocked_by_previous_days || item.is_blocked_by_late) return null;
  const day = item.today;
  if (!day?.id || day.status !== 'pending' || String(day.id) === String(saved.id)
    || String(day.date || '').slice(0, 10) !== mapped.date || !matchesNazemRange(day, mapped)) return null;
  return { item, day };
}

export function findMatchingNazemLate(items, mapped) {
  const candidates = items.filter(item => matchesNazemRange(item, mapped));
  const identified = candidates.find(item => mapped.nazemLateId
    ? String(item.id) === String(mapped.nazemLateId)
    : mapped.nazemSourceDayId && String(item.source_day_id) === String(mapped.nazemSourceDayId));
  if (identified) return identified;
  // Do not redirect an already identified result to a different repeated passage.
  if (mapped.nazemLateId || mapped.nazemSourceDayId) return null;
  const dated = candidates.filter(item => String(item.date || item.follow_up_date || item.task_date || '').slice(0, 10) === mapped.date);
  if (dated.length === 1) return dated[0];
  if (candidates.length > 1) throw reviewNazemError('يوجد أكثر من إكمال متأخر بنفس المقدار؛ تعذر تحديد السجل المرتبط بالنتيجة المحفوظة.', 'NAZEM_LATE_IDENTITY_AMBIGUOUS');
  if (candidates.length) throw reviewNazemError('تعذر إثبات تاريخ وهوية المتأخر المرتبط بالتقييم المحفوظ.', 'NAZEM_LATE_IDENTITY_AMBIGUOUS');
  return null;
}
