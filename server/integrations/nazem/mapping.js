import { blockedNazemError } from './errors.js';

const AMOUNT_BY_QUARTER_UNITS = new Map([
  [1, 'ربع وجه'],
  [2, 'نصف وجه'],
  [4, 'وجه كامل'],
  [6, 'وجه ونصف'],
  [8, 'وجهين'],
]);

const QUARTER_UNITS_BY_AMOUNT = new Map(
  [...AMOUNT_BY_QUARTER_UNITS].map(([units, amount]) => [amount, units]),
);

const NAZEM_ATTENDANCE_STATUS_BY_RUWASI_STATUS = Object.freeze({
  present: 2,
  absent: 3,
  excused: 4,
  late: 5,
});

export const normalizeNazemText = (value) => String(value ?? '')
  .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

export const mapRuwasiAttendanceStatusToNazem = (status) => (
  NAZEM_ATTENDANCE_STATUS_BY_RUWASI_STATUS[String(status || '')] || null
);

export function toQuarterFaceUnits(value) {
  const units = Number(value) * 4;
  return Number.isInteger(units) ? units : null;
}

function fromQuarterFaceUnits(units) {
  return Number(units) / 4;
}

export function mapNazemAmountToRuwasi(amount) {
  const normalizedAmount = normalizeNazemText(amount);
  const units = QUARTER_UNITS_BY_AMOUNT.get(normalizedAmount);
  if (!units) {
    throw blockedNazemError(
      `مقدار ناظم ${amount || 'غير معروف'} غير مدعوم في المنصة.`,
      'NAZEM_AMOUNT_UNAVAILABLE',
    );
  }
  return fromQuarterFaceUnits(units);
}

const mapRuwasiTrackToNazemTab = (track) => (
  track === 'mastery' ? 'الإتقان' : 'الحفظ'
);

const normalizeRecitationDate = (value) => {
  const direct = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

function mapRuwasiAmountToNazem(dailyPages) {
  const amount = AMOUNT_BY_QUARTER_UNITS.get(toQuarterFaceUnits(dailyPages));
  if (!amount) {
    throw blockedNazemError(
      `المقدار ${dailyPages} وجه غير متاح ضمن مقادير ناظم الحالية.`,
      'NAZEM_AMOUNT_UNAVAILABLE',
    );
  }
  return amount;
}

const mapRuwasiDirectionToNazem = ({ startPage, endPage }) => (
  Number(startPage) > Number(endPage) ? 'تصاعدي' : 'تنازلي'
);

export function mapRuwasiPlanToNazem(plan) {
  const tab = mapRuwasiTrackToNazemTab(plan.track);
  return {
    tab,
    amount: mapRuwasiAmountToNazem(plan.dailyPages),
    direction: tab === 'الحفظ' ? mapRuwasiDirectionToNazem(plan) : null,
    startSurah: String(plan.startSurahName || ''),
    startAyah: Number(plan.startAyah),
    endSurah: String(plan.endSurahName || ''),
    endAyah: Number(plan.endAyah),
    repeatCount: Math.max(1, Number(plan.repeatCount || 10)),
    linkCount: Math.max(0, Number(plan.linkPages || 5)),
  };
}

function mapRuwasiReviewRangeToNazem(range) {
  if (!range) return null;
  return {
    tab: 'المراجعة',
    amount: null,
    direction: null,
    startSurah: String(range.startSurahName || ''),
    startAyah: Number(range.startAyah),
    endSurah: String(range.endSurahName || ''),
    endAyah: Number(range.endAyah),
    repeatCount: null,
    linkCount: null,
  };
}

export function mapRuwasiPlanBundleToNazem(plan, reviewRange = null) {
  return {
    primary: mapRuwasiPlanToNazem(plan),
    revision: mapRuwasiReviewRangeToNazem(reviewRange),
    startDate: plan.startDate || null,
  };
}

// An imported review range belongs to Nazem; local memorization history may be disjoint.
// Keep the strict local-range mapper for outbound plan creation only.
export function mapNazemOwnedPlanSnapshot(plan, source = {}) {
  return {
    ...mapRuwasiPlanBundleToNazem(plan),
    revision: source?.revision || null,
    planVersion: plan.planVersion,
  };
}

export function mapRuwasiRecitationToNazem(recitation) {
  const taskType = String(recitation.taskType || '');
  const track = String(recitation.track || 'memorization');
  const remoteType = taskType === 'review'
    ? 'revision'
    : track === 'mastery' ? 'master' : 'conserve';
  const attendanceStatus = mapRuwasiAttendanceStatusToNazem(recitation.attendanceStatus);
  const warningCount = Math.max(0, Number(recitation.warningCount || 0));
  const mistakeCount = Math.max(0, Number(recitation.mistakeCount || 0));
  if (taskType === 'link') return {
    taskType, remoteType: 'conserve', remoteTab: 'حفظ',
    date: normalizeRecitationDate(recitation.taskDate || recitation.sessionDate),
    sessionDate: normalizeRecitationDate(recitation.sessionDate || recitation.taskDate),
    attendanceStatus,
    completed: Number(recitation.linkCount || 0) > 0,
    linkCount: recitation.linkCount === null ? null : Math.max(0, Number(recitation.linkCount || 0)),
  };
  return {
    taskType,
    remoteType,
    remoteTab: remoteType === 'revision' ? 'مراجعة' : remoteType === 'master' ? 'إتقان' : 'حفظ',
    warningCount,
    mistakeCount,
    remoteMistakeCount: remoteType === 'master' ? 0 : mistakeCount,
    // Rawasi warnings affect the local score only. Nazem tune is not inferred from them.
    remoteTuneCount: 0,
    score: Math.max(0, Number(recitation.evaluationScore || 0)),
    completed: Boolean(recitation.teacherCompleted),
    // Nazem identifies scheduled and overdue portions by the plan day, even when
    // the teacher completes that portion during a later listening session.
    date: normalizeRecitationDate(recitation.taskDate || recitation.sessionDate),
    sessionDate: normalizeRecitationDate(recitation.sessionDate || recitation.taskDate),
    attendanceStatus,
    repeatCount: Math.max(0, Number(recitation.actualRepeatCount ?? recitation.plannedRepeatCount ?? 0)),
    listeningCount: Math.max(0, Number(recitation.actualListeningCount ?? recitation.plannedListeningCount ?? 0)),
    linkCount: recitation.linkCount === null ? null : Math.max(0, Number(recitation.linkCount || 0)),
    fromSurah: recitation.fromSurahName,
    fromSurahId: Number(recitation.fromSurah),
    fromAyah: Number(recitation.fromAyah),
    scheduledToSurahId: Number(recitation.scheduledToSurah || recitation.toSurah),
    scheduledToAyah: Number(recitation.scheduledToAyah || recitation.toAyah),
    toSurah: recitation.actualToSurahName || recitation.toSurahName,
    toAyah: Number(recitation.actualToAyah || recitation.toAyah),
    toSurahId: Number(recitation.actualToSurah || recitation.toSurah),
  };
}

const quranPosition = (item, prefix) => ({
  page: Number(item[`${prefix}Page`] || 0),
  surah: Number(item[`${prefix}Surah`] || 0),
  ayah: Number(item[`${prefix}Ayah`] || 0),
});

const comparePosition = (left, right, direction) => {
  for (const field of ['page', 'surah', 'ayah']) {
    if (left[field] !== right[field]) return (left[field] - right[field]) * direction;
  }
  return 0;
};

const minimumMetric = (rows, actualKey, plannedKey) => {
  const values = rows.map((row) => Math.max(0, Number(row[actualKey] ?? row[plannedKey] ?? 0)));
  return values.length ? Math.min(...values) : 0;
};

export function mapRuwasiRecitationGroupToNazem(recitations = []) {
  if (!recitations.length) {
    throw blockedNazemError('لا توجد مقاطع تسميع لتجميعها قبل الإرسال إلى ناظم.', 'RUWASI_RECITATION_GROUP_EMPTY');
  }
  const seed = recitations[0];
  if (recitations.some((row) => row.taskType !== seed.taskType || row.track !== seed.track
    || String(row.planId || '') !== String(seed.planId || '') || String(row.studentId || '') !== String(seed.studentId || ''))) {
    throw blockedNazemError('لا يمكن دمج مسارين مختلفين في نتيجة تسميع واحدة.', 'RUWASI_RECITATION_GROUP_MIXED');
  }
  if (seed.taskType === 'link') return {
    ...mapRuwasiRecitationToNazem(seed),
    partCount: recitations.length,
    attemptIds: recitations.map((row) => Number(row.id)),
    taskIds: recitations.map((row) => Number(row.taskId)),
  };
  const direction = Number(seed.planStartPage || 0) > Number(seed.planEndPage || 0) ? -1 : 1;
  const ordered = [...recitations].sort((left, right) => (
    comparePosition(quranPosition(left, 'from'), quranPosition(right, 'from'), direction)
  ));
  const first = ordered[0];
  const last = ordered.at(-1);
  const scheduled = ordered.find((row) => row.scheduledToSurah && row.scheduledToAyah) || last;
  const warningCount = ordered.reduce((sum, row) => sum + Math.max(0, Number(row.warningCount || 0)), 0);
  const mistakeCount = ordered.reduce((sum, row) => sum + Math.max(0, Number(row.mistakeCount || 0)), 0);
  const completed = ordered.every((row) => Boolean(row.teacherCompleted));
  const mapped = mapRuwasiRecitationToNazem({
    ...first,
    warningCount,
    mistakeCount,
    evaluationScore: ordered.reduce((sum, row) => sum + Math.max(0, Number(row.evaluationScore || 0)), 0) / ordered.length,
    teacherCompleted: completed,
    actualRepeatCount: minimumMetric(ordered, 'actualRepeatCount', 'plannedRepeatCount'),
    actualListeningCount: minimumMetric(ordered, 'actualListeningCount', 'plannedListeningCount'),
    linkCount: first.linkCount === null ? null : Math.max(0, Number(first.linkCount || 0)),
    fromPage: first.fromPage,
    fromSurah: first.fromSurah,
    fromAyah: first.fromAyah,
    fromSurahName: first.fromSurahName,
    toPage: last.toPage,
    toSurah: last.toSurah,
    toAyah: last.toAyah,
    toSurahName: last.toSurahName,
    scheduledToSurah: scheduled.scheduledToSurah || scheduled.toSurah,
    scheduledToAyah: scheduled.scheduledToAyah || scheduled.toAyah,
    actualToPage: last.actualToPage,
    actualToSurah: last.actualToSurah,
    actualToAyah: last.actualToAyah,
    actualToSurahName: last.actualToSurahName,
  });
  return {
    ...mapped,
    warningCount,
    mistakeCount,
    remoteMistakeCount: mapped.remoteType === 'master' ? 0 : mistakeCount,
    remoteTuneCount: 0,
    completed,
    partCount: ordered.length,
    attemptIds: ordered.map((row) => Number(row.id)),
    taskIds: ordered.map((row) => Number(row.taskId)),
  };
}

export const nazemRemoteErrorCount = (day = {}) => (
  Math.max(0, Number(day.mistake || 0)) + Math.max(0, Number(day.tune || 0))
);
