export const NAZEM_SYNC_STATUS_LABELS = Object.freeze({
  pending: 'بانتظار المزامنة',
  syncing: 'جاري المزامنة',
  synced: 'تمت المزامنة مع ناظم',
  retrying: 'ستتم إعادة المحاولة',
  blocked: 'غير متاحة في ناظم',
  requires_review: 'تحتاج مراجعة',
  conflict: 'يوجد تعارض',
  failed: 'فشلت المزامنة',
  deleted: 'حُذفت من ناظم',
  detached: 'أُغلق الربط الخارجي',
  dismissed: 'أُغلقت يدويًا',
});

const COMPLETED_NAZEM_FOLLOW_UP_STATUSES = new Set([
  'completed',
  'partial',
  'completed_early',
  'partial_early',
  'completed_late',
]);

export const isNazemFollowUpCompleted = (status) => (
  COMPLETED_NAZEM_FOLLOW_UP_STATUSES.has(String(status || '').trim().toLowerCase())
);

export const normalizeArabicPersonName = (value = '') => String(value)
  .normalize('NFKD')
  .replace(/[\u064B-\u065F\u0670]/g, '')
  .replace(/[أإآٱ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/ة/g, 'ه')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

export const calculateNameMatchConfidence = (left, right) => {
  const first = normalizeArabicPersonName(left);
  const second = normalizeArabicPersonName(right);
  if (!first || !second) return 0;
  if (first === second) return 1;
  const firstList = first.split(' ');
  const secondList = second.split(' ');
  const firstWords = new Set(firstList);
  const secondWords = new Set(secondList);
  const intersection = [...firstWords].filter((word) => secondWords.has(word)).length;
  const union = new Set([...firstWords, ...secondWords]).size;
  const orderedMatches = firstList.reduce((total, word, index) => (
    total + (secondList[index] === word ? 1 : 0)
  ), 0);
  const orderedCoverage = orderedMatches / Math.max(1, Math.min(firstList.length, secondList.length));
  const tokenCoverage = intersection / Math.max(firstList.length, secondList.length);
  const jaccard = union ? intersection / union : 0;
  let confidence = (orderedCoverage * 0.65) + (tokenCoverage * 0.25) + (jaccard * 0.1);
  const shorter = firstList.length <= secondList.length ? firstList : secondList;
  const longer = firstList.length <= secondList.length ? secondList : firstList;
  const hasSameFirstAndLast = shorter.length >= 2
    && shorter[0] === longer[0]
    && shorter[shorter.length - 1] === longer[longer.length - 1];
  if (hasSameFirstAndLast && shorter.every((word) => longer.includes(word))) {
    confidence = Math.max(confidence, 0.9);
  }
  if (Math.min(firstList.length, secondList.length) < 2 && firstList.length !== secondList.length) {
    return Math.min(0.6, confidence);
  }
  return confidence;
};

export const findUniqueArabicPersonNameMatch = (
  candidates = [],
  targetName = '',
  { minimumConfidence = 0.8, minimumGap = 0.08 } = {},
) => {
  const ranked = candidates
    .map((candidate) => ({
      candidate,
      confidence: calculateNameMatchConfidence(candidate?.name, targetName),
    }))
    .sort((left, right) => right.confidence - left.confidence);
  const closest = ranked[0];
  const nextClosest = ranked[1];
  if (!closest || closest.confidence < minimumConfidence) return null;
  if (nextClosest && closest.confidence - nextClosest.confidence < minimumGap) return null;
  return closest;
};

export const isNazemExternalStudentId = (value) => {
  const normalized = String(value || '').trim();
  return normalized.length <= 190
    && /\d/.test(normalized)
    && /^[\p{L}\p{N}:_-]+$/u.test(normalized)
    && !normalized.startsWith('name:');
};

const addDateDays = (date, days) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + Number(days || 0));
  return value.toISOString().slice(0, 10);
};

const dateWeekDay = (date) => new Date(`${date}T00:00:00.000Z`).getUTCDay();

export const resolveNazemPlanResumeDate = ({
  todayDate,
  scheduleDays = [],
  progressDate = null,
  completedToday = false,
  completedPlan = false,
}) => {
  if (completedPlan) return todayDate;
  let resumeDate = progressDate === todayDate && completedToday
    ? addDateDays(todayDate, 1)
    : todayDate;
  const allowedDays = scheduleDays.map(Number).filter((day) => day >= 0 && day <= 6);
  while (allowedDays.length && !allowedDays.includes(dateWeekDay(resumeDate))) {
    resumeDate = addDateDays(resumeDate, 1);
  }
  return resumeDate;
};
