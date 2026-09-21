import { normalizeArabicPersonName } from '../../../shared/nazem-integration.js';
import { blockedNazemError, reviewNazemError } from './errors.js';

const TAB_BY_REMOTE_TYPE = Object.freeze({
  conserve: 'الحفظ',
  master: 'الإتقان',
  revision: 'المراجعة',
});

const AMOUNT_BY_DAILY_FACES = new Map([
  [0.25, 'ربع وجه'],
  [0.5, 'نصف وجه'],
  [1, 'وجه كامل'],
  [1.5, 'وجه ونصف'],
  [2, 'وجهين'],
]);

const DIRECTION_BY_REMOTE_VALUE = Object.freeze({
  reverse: 'تصاعدي',
  forward: 'تنازلي',
});

const cleanText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

export function extractNazemPlanApiPage(payload = {}) {
  const page = payload?.data || {};
  return {
    currentPage: Math.max(1, Number(page.current_page || 1)),
    lastPage: Math.max(1, Number(page.last_page || page.current_page || 1)),
    nextPageUrl: cleanText(page.next_page_url) || null,
    groups: (Array.isArray(page.data) ? page.data : []).flatMap((row) => {
      if (!row?.id) return [];
      return [{
        externalId: String(row.id),
        organizationName: cleanText(row.company),
        circleName: cleanText(row.class_name),
        text: cleanText([row.company, row.class_name, row.term, row.status].filter(Boolean).join(' ')),
        studentCount: Math.max(0, Number(row.students_count || 0)),
      }];
    }),
  };
}
export function resolveNazemApiPlanStudent(planDetails = {}, studentLink = {}) {
  const students = Array.isArray(planDetails?.students) ? planDetails.students : [];
  const expectedId = String(studentLink.nazemStudentId || '').trim();
  if (expectedId) {
    const matches = students.filter((student) => String(student?.student_id || '') === expectedId);
    if (matches.length > 1) {
      throw reviewNazemError(
        'ظهر معرّف الطالب أكثر من مرة داخل استجابة خطة ناظم.',
        'NAZEM_PLAN_STUDENT_ID_AMBIGUOUS',
      );
    }
    return matches[0] || null;
  }
  const expectedName = normalizeArabicPersonName(studentLink.nazemStudentName);
  const matches = students.filter((student) => (
    normalizeArabicPersonName(student?.student_name) === expectedName
  ));
  if (matches.length > 1) {
    throw reviewNazemError(
      'يوجد أكثر من طالب بالاسم نفسه داخل استجابة خطة ناظم.',
      'NAZEM_PLAN_STUDENT_AMBIGUOUS',
    );
  }
  return matches[0] || null;
}

function mapDailyAmount(value) {
  const amount = AMOUNT_BY_DAILY_FACES.get(Number(value));
  if (!amount) {
    throw blockedNazemError(
      `مقدار ناظم ${value ?? 'غير معروف'} وجه غير مدعوم في المنصة.`,
      'NAZEM_AMOUNT_UNAVAILABLE',
    );
  }
  return amount;
}

export function mapNazemApiPlanItem(item, externalPlanId, studentName) {
  const tab = TAB_BY_REMOTE_TYPE[String(item?.type || '')];
  if (!tab) return null;
  return {
    externalId: String(externalPlanId),
    studentName: cleanText(studentName),
    tab,
    amount: tab === 'المراجعة' ? null : mapDailyAmount(item.daily_amount),
    direction: tab === 'الحفظ'
      ? DIRECTION_BY_REMOTE_VALUE[String(item.direction || '')] || null
      : null,
    startSurah: cleanText(item.surah_from_name),
    startAyah: Number(item.verse_from || 0),
    endSurah: cleanText(item.surah_to_name),
    endAyah: Number(item.verse_to || 0),
    repeatCount: item.repetition == null ? null : Number(item.repetition),
    linkCount: item.link == null ? null : Number(item.link),
    startDate: cleanText(item.start_date) || null,
  };
}

export function mapNazemApiPlanBundle(planDetails = {}, studentLink = {}) {
  const student = resolveNazemApiPlanStudent(planDetails, studentLink);
  if (!student) return null;
  const items = (Array.isArray(student.items) ? student.items : [])
    .map((item) => mapNazemApiPlanItem(item, planDetails.id, student.student_name))
    .filter(Boolean);
  const primary = items.find((item) => item.tab === 'الحفظ')
    || items.find((item) => item.tab === 'الإتقان')
    || null;
  if (!primary) return null;
  const revision = items.find((item) => item.tab === 'المراجعة') || null;
  return {
    externalId: String(planDetails.id),
    primary,
    revision,
    startDate: primary.startDate || revision?.startDate || null,
  };
}
