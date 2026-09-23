import { includeNazemPlanStudents } from './planStudents.js';
import { nazemWriteFailure } from './writeFailure.js';
import { readNazemStudentActivity } from './studentActivity.js';
import { selectNazemFollowUpItem } from './followUpCycles.js';
import { findMatchingNazemLate, matchesNazemTarget, findRegeneratedPendingDay } from './recitationTarget.js';
import {
  blockedNazemError,
  conflictNazemError,
  reviewNazemError,
  transientNazemError,
} from './errors.js';
import { secureNazemBrowserContext } from './browserSecurity.js';
import {
  isNazemFollowUpCompleted,
  isNazemExternalStudentId,
  normalizeArabicPersonName,
} from '../../../shared/nazem-integration.js';
import { getBusinessDateDaysAgo, shiftDateOnly } from '../../../shared/business-date.js';
import {
  extractNazemPlanApiPage,
  mapNazemApiPlanBundle,
  resolveNazemApiPlanStudent,
} from './planApi.js';

const NAZEM_BASE_URL = 'https://nazem-plus.com';
const SELECTORS = Object.freeze({
  loginUsername: 'input[name="username"], input[autocomplete="username"], input[type="text"]',
  loginPassword: 'input[name="password"], input[autocomplete="current-password"], input[type="password"]',
  loginSubmitName: 'تسجيل الدخول',
  loginRejectedText: /These credentials do not match our records|بيانات الدخول.*لا تطابق|بيانات الاعتماد.*غير صحيحة/i,
  teacherDashboardHeading: 'لوحة المعلم',
  studentsPath: '/students',
  educationalPlansPath: '/educational-plans',
  addPlanTab: 'إضافة خطة',
  followPlansTab: 'متابعة الخطط',
  organizationPlaceholder: 'اختر الجهة',
  circlePlaceholder: 'اختر الحلقة',
  studentsPlaceholder: 'اختر الطلاب',
  amountPlaceholder: 'اختر المقدار',
  directionPlaceholder: 'اختر الاتجاه',
  surahPlaceholder: 'اختر السورة',
  ayahPlaceholder: 'اختر الآية',
  saveButton: 'حفظ',
  confirmSaveButton: 'تأكيد الحفظ',
  updateSaveButton: 'حفظ التعديلات',
  createSuccessText: /تم حفظ الخطة بنجاح|Educational plan created successfully/i,
  updateSuccessText: /تم تحديث بنود الخطة بنجاح|تم الحفظ بنجاح/i,
});

const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const planCardLabel = (tab) => cleanText(tab).replace(/^ال/, '');
const FINAL_FOLLOW_UP_STATUSES = new Set([
  'completed',
  'not_completed',
  'partial',
  'completed_early',
  'partial_early',
  'completed_late',
]);

const responseData = (payload) => payload?.data?.data || payload?.data || payload || {};
const saudiDate = (daysAgo = 0) => getBusinessDateDaysAgo(daysAgo);

const normalizeDateOnly = (value) => {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value || ''));
  if (match) return match[1];
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

const scheduledFollowUpKey = (day) => [
  day.remoteType,
  day.id || '',
  day.date,
  day.surah_from,
  day.verse_from,
  day.surah_to,
  day.verse_to,
].join(':');

export function normalizeNazemFollowUpItems(value) {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === 'object');
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value.data)) return normalizeNazemFollowUpItems(value.data);
  if (Array.isArray(value.items)) return normalizeNazemFollowUpItems(value.items);
  if (
    Object.hasOwn(value, 'type')
    || Object.hasOwn(value, 'id')
    || Object.hasOwn(value, 'surah_from')
    || Object.hasOwn(value, 'verse_from')
  ) {
    return [value];
  }
  return Object.values(value).flatMap((item) => normalizeNazemFollowUpItems(item));
}

export function shouldRequireNazemAttendance(mappedDate) {
  return normalizeDateOnly(mappedDate) === saudiDate();
}

export function mapNazemPendingFollowUps(item, {
  remoteType,
  attendanceStatus = null,
} = {}) {
  if (remoteType === 'revision') return [];
  const taskType = 'memorization';
  const lateItems = normalizeNazemFollowUpItems(item?.late_items);
  return lateItems.flatMap((late) => {
    const lateDate = normalizeDateOnly(
      late?.source_date || late?.date || late?.follow_up_date || late?.task_date || late?.scheduled_date,
    );
    if (!lateDate || isNazemFollowUpCompleted(late?.status)) return [];
    return [{
      ...late,
      ...(item?.id ? { nazemItemId: String(item.id) } : {}),
      date: lateDate,
      remoteType,
      taskType,
      attendanceStatus,
      nazemLate: true,
    }];
  });
}

function findFollowUpDay(payload, studentLink, remoteType, options = {}) {
  const data = responseData(payload);
  const student = resolveNazemApiPlanStudent(data, studentLink);
  const item = selectNazemFollowUpItem(normalizeNazemFollowUpItems(student?.items), remoteType, options);
  return { data, student, item, day: item?.today || null };
}

function expectedFollowUpMetrics(mapped) {
  if (!mapped.completed) return {};
  if (mapped.remoteType === 'conserve') {
    return {
      mistake: Number(mapped.remoteMistakeCount || 0),
      hearing: mapped.listeningCount > 0 ? 1 : 2,
      repetition: Number(mapped.repeatCount || 0),
      ...(mapped.linkCount == null ? {} : { link: Number(mapped.linkCount) }),
    };
  }
  if (mapped.remoteType === 'revision') {
    return {
      mistake: Number(mapped.remoteMistakeCount || 0),
      tune: Number(mapped.remoteTuneCount || 0),
    };
  }
  return {};
}

export function nazemFollowUpMetricsMatch(day, mapped) {
  return Object.entries(expectedFollowUpMetrics(mapped)).every(([field, expected]) => (
    Object.hasOwn(day || {}, field) && Number(day[field]) === expected
  ));
}

function verifyFollowUpMetrics(day, mapped) {
  const expected = expectedFollowUpMetrics(mapped);
  const missing = Object.keys(expected).filter((field) => !Object.hasOwn(day || {}, field));
  if (missing.length) {
    throw reviewNazemError(
      'استجابة ناظم لا تحتوي جميع تفاصيل التقييم اليومي المطلوبة.',
      'NAZEM_FOLLOW_UP_METRICS_MISSING',
    );
  }
  if (!nazemFollowUpMetricsMatch(day, mapped)) {
    throw conflictNazemError(
      'تفاصيل التقييم اليومي المسجلة في ناظم تختلف عن المنصة.',
      'NAZEM_RECITATION_METRICS_CONFLICT',
      { remote: day, expected },
    );
  }
  return expected;
}

function verifyFinalFollowUp(day, mapped) {
  if (!day || !FINAL_FOLLOW_UP_STATUSES.has(String(day.status || ''))) return null;
  verifyScheduledStart(day, mapped);
  const remoteCompleted = isNazemFollowUpCompleted(day.status);
  if (remoteCompleted !== mapped.completed) {
    throw conflictNazemError(
      'نتيجة التسميع المسجلة في ناظم تختلف عن نتيجة المنصة.',
      'NAZEM_RECITATION_RESULT_CONFLICT',
      { remote: day },
    );
  }
  if (mapped.completed) {
    if (!Object.hasOwn(day, 'actual_surah_to') || !Object.hasOwn(day, 'actual_verse_to')) {
      throw reviewNazemError(
        'استجابة ناظم لا تحتوي نهاية الورد الفعلية.',
        'NAZEM_FOLLOW_UP_RANGE_MISSING',
      );
    }
    if (
      Number(day.actual_surah_to) !== Number(mapped.toSurahId)
      || Number(day.actual_verse_to) !== Number(mapped.toAyah)
    ) {
      throw conflictNazemError(
        'نهاية التسميع المسجلة في ناظم تختلف عن نهاية المنصة.',
        'NAZEM_RECITATION_RANGE_CONFLICT',
        { remote: day },
      );
    }
  }
  const metrics = verifyFollowUpMetrics(day, mapped);
  return {
    externalId: String(day.id),
    status: day.status,
    actualSurah: day.actual_surah_to || null,
    actualAyah: day.actual_verse_to || null,
    metrics,
  };
}

function verifyScheduledStart(day, mapped) {
  const requiredFields = ['surah_from', 'verse_from', 'surah_to', 'verse_to'];
  if (requiredFields.some((field) => !Object.hasOwn(day || {}, field))) {
    throw reviewNazemError(
      'استجابة ناظم لا تحتوي نطاق الورد المجدول كاملًا.',
      'NAZEM_SCHEDULED_RANGE_MISSING',
    );
  }
  if (
    Number(day.surah_from) !== Number(mapped.fromSurahId)
    || Number(day.verse_from) !== Number(mapped.fromAyah)
  ) {
    throw conflictNazemError(
      'بداية الورد المجدول في ناظم تختلف عن ورد المنصة.',
      'NAZEM_RECITATION_START_CONFLICT',
      { remote: day },
    );
  }
  if (
    Number(day.surah_to) !== Number(mapped.scheduledToSurahId)
    || Number(day.verse_to) !== Number(mapped.scheduledToAyah)
  ) {
    throw conflictNazemError(
      'نهاية الورد المجدول في ناظم تختلف عن ورد المنصة.',
      'NAZEM_RECITATION_SCHEDULED_END_CONFLICT',
      { remote: day },
    );
  }
}

function collectNamedObjects(value, output = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectNamedObjects(item, output));
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  const name = value.name ?? value.full_name ?? value.student_name ?? value.title ?? value.text;
  const id = value.id ?? value.student_id ?? value.user_id ?? value.value ?? value.uuid;
  if (name && id !== undefined && id !== null) {
    output.push({ name: cleanText(name), id: String(id) });
  }
  Object.values(value).forEach((item) => collectNamedObjects(item, output));
  return output;
}

async function stableOptionId(option) {
  for (const attribute of ['data-value', 'value', 'data-id', 'data-key']) {
    const value = cleanText(await option.getAttribute(attribute));
    if (value) return value;
  }
  const id = cleanText(await option.getAttribute('id'));
  return id && !/^(input|list-item|mantine|radix|headlessui)-/i.test(id) ? id : null;
}

export function deduplicateNazemStudents(students = []) {
  const unique = new Map();
  students.forEach((student) => {
    const contextKey = [
      cleanText(student.organization?.name),
      cleanText(student.circle?.name),
      cleanText(student.name),
    ].join('|');
    const key = student.externalId ? `id:${student.externalId}` : `context:${contextKey}`;
    if (!unique.has(key)) unique.set(key, student);
  });
  return [...unique.values()];
}

const studentContextKey = (organizationName, circleName) => [
  normalizeArabicPersonName(organizationName),
  normalizeArabicPersonName(circleName),
].join('|');

export function mergeNazemStudentSources(optionStudents = [], profiles = [], availableContexts = []) {
  const contexts = new Map();
  [...availableContexts, ...optionStudents.map((student) => ({
    organization: student.organization,
    circle: student.circle,
  }))].forEach(({ organization, circle }) => {
    const key = studentContextKey(organization?.name, circle?.name);
    if (organization?.name && circle?.name && !contexts.has(key)) {
      contexts.set(key, { organization, circle });
    }
  });
  const profileStudents = profiles.flatMap((profile) => {
    const context = contexts.get(studentContextKey(profile.organizationName, profile.circleName));
    if (!context || !profile.id || !profile.name) return [];
    return [{
      externalId: String(profile.id),
      name: profile.name,
      organization: { id: context.organization?.id || null, name: profile.organizationName },
      circle: { id: context.circle?.id || null, name: profile.circleName },
      profile,
    }];
  });
  const profileById = new Map(profiles.map((profile) => [String(profile.id), profile]));
  const resolvedOptions = optionStudents.flatMap((student) => {
    if (isNazemExternalStudentId(student.externalId)) return [student];
    const matches = profileStudents.filter((profileStudent) => (
      normalizeArabicPersonName(profileStudent.name) === normalizeArabicPersonName(student.name)
      && studentContextKey(profileStudent.organization?.name, profileStudent.circle?.name)
        === studentContextKey(student.organization?.name, student.circle?.name)
    ));
    // The roster supplies authoritative IDs even when the dropdown supplies only names.
    return matches.length === 1 ? [{ ...student, externalId: matches[0].externalId }] : [];
  });
  return deduplicateNazemStudents([...resolvedOptions, ...profileStudents]).map((student) => ({
    ...student,
    profile: profileById.get(String(student.externalId)) || student.profile || null,
  }));
}

export function normalizeNazemStudentProfile(profile = {}) {
  return {
    id: profile.id == null ? null : String(profile.id),
    name: cleanText(profile.name),
    nationalId: cleanText(profile.national_id),
    phone: cleanText(profile.phone),
    username: cleanText(profile.username),
    email: cleanText(profile.email),
    educationLevel: cleanText(profile.edu_level_name),
    organizationName: cleanText(profile.company_name),
    circleName: cleanText(profile.class_name),
    joinedDate: cleanText(profile.joined_date),
    status: cleanText(profile.status),
    statusName: cleanText(profile.status_name),
  };
}

const normalizedComparablePlan = (plan) => ({
  tab: cleanText(plan?.tab),
  amount: cleanText(plan?.amount),
  direction: cleanText(plan?.direction),
  startSurah: cleanText(plan?.startSurah),
  startAyah: Number(plan?.startAyah || 0),
  endSurah: cleanText(plan?.endSurah),
  endAyah: Number(plan?.endAyah || 0),
  repeatCount: plan?.repeatCount == null ? null : Number(plan.repeatCount),
  linkCount: plan?.linkCount == null ? null : Number(plan.linkCount),
});

export function nazemPlanItemMatches(actual, expected) {
  const remote = normalizedComparablePlan(actual);
  const local = normalizedComparablePlan(expected);
  const requiredFields = ['tab', 'startSurah', 'startAyah', 'endSurah', 'endAyah'];
  if (local.tab !== 'المراجعة') requiredFields.push('amount');
  if (local.tab === 'الحفظ') requiredFields.push('direction');
  if (local.repeatCount != null) requiredFields.push('repeatCount');
  if (local.linkCount != null) requiredFields.push('linkCount');
  return requiredFields.every((field) => remote[field] === local[field]);
}

export function nazemPlanBundleMatches(actual, expected) {
  if (!actual?.primary || !expected?.primary) return false;
  if (!nazemPlanItemMatches(actual.primary, expected.primary)) return false;
  if (Boolean(actual.revision) !== Boolean(expected.revision)) return false;
  return !expected.revision || nazemPlanItemMatches(actual.revision, expected.revision);
}

export function resolveNazemPlanStudentIdentity(identities = [], studentLink = {}) {
  const expectedId = isNazemExternalStudentId(studentLink.nazemStudentId)
    ? String(studentLink.nazemStudentId)
    : '';
  const identitiesWithId = identities.filter((identity) => identity.externalId);
  const idMatches = expectedId
    ? identitiesWithId.filter((identity) => String(identity.externalId) === expectedId)
    : [];
  if (idMatches.length === 1) return idMatches[0];
  if (idMatches.length > 1) {
    throw reviewNazemError(
      'ظهر معرّف الطالب أكثر من مرة داخل مجموعة خطة ناظم.',
      'NAZEM_PLAN_STUDENT_ID_AMBIGUOUS',
    );
  }
  if (expectedId && identitiesWithId.length) {
    const idlessNameMatches = identities.filter((identity) => (
      !identity.externalId
      && identity.normalizedName === normalizeArabicPersonName(studentLink.nazemStudentName)
    ));
    if (idlessNameMatches.length === 1) return idlessNameMatches[0];
    if (idlessNameMatches.length > 1) {
      throw reviewNazemError(
        'يوجد أكثر من طالب بلا معرّف وبالاسم نفسه داخل مجموعة خطة ناظم.',
        'NAZEM_PLAN_STUDENT_AMBIGUOUS',
      );
    }
    throw reviewNazemError(
      'الخطة المرتبطة لا تحتوي معرّف الطالب المتوقع في ناظم.',
      'NAZEM_PLAN_STUDENT_MISMATCH',
    );
  }
  const expectedName = normalizeArabicPersonName(studentLink.nazemStudentName);
  const nameMatches = identities.filter((identity) => identity.normalizedName === expectedName);
  if (nameMatches.length !== 1) {
    throw reviewNazemError(
      nameMatches.length ? 'يوجد أكثر من طالب بالاسم نفسه داخل مجموعة خطة ناظم.' : 'الخطة المرتبطة لا تحتوي الطالب المتوقع في ناظم.',
      nameMatches.length ? 'NAZEM_PLAN_STUDENT_AMBIGUOUS' : 'NAZEM_PLAN_STUDENT_MISMATCH',
    );
  }
  return nameMatches[0];
}

export class NazemAdapter {
  constructor({ username, password, sessionState = null, headless = true, resolveLateSourceDate = null } = {}) {
    this.resolveLateSourceDate = resolveLateSourceDate;
    this.lateSourceDates = new Map();
    this.username = username;
    this.password = password;
    this.sessionState = sessionState;
    this.headless = headless;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.pageClockInstalled = false;
    this.followUpApiBase = '';
    this.followUpApiHeaders = {};
    this.followUpApiPathTemplate = '';
    this.followUpApiPaths = new Map();
    this.followUpPayloadCache = new Map();
    this.planApiBase = '';
    this.planApiHeaders = {};
    this.planApiFirstPage = null;
    this.planDetailsCache = new Map();
  }

  async open() {
    let playwright;
    try {
      playwright = await import('playwright');
    } catch (cause) {
      throw reviewNazemError('Playwright غير مثبت في بيئة عامل مزامنة ناظم.', 'NAZEM_PLAYWRIGHT_MISSING', cause);
    }
    const launchOptions = { headless: this.headless };
    if (process.env.NAZEM_BROWSER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.NAZEM_BROWSER_EXECUTABLE_PATH;
    }
    try {
      this.browser = await playwright.chromium.launch(launchOptions);
      this.context = await this.browser.newContext({
        locale: 'ar-SA',
        timezoneId: 'Asia/Riyadh',
        serviceWorkers: 'block',
        ...(this.sessionState ? { storageState: this.sessionState } : {}),
      });
      await secureNazemBrowserContext(this.context);
      this.page = await this.context.newPage();
      this.page.setDefaultTimeout(Number(process.env.NAZEM_ACTION_TIMEOUT_MS || 15_000));
      this.page.setDefaultNavigationTimeout(Number(process.env.NAZEM_NAVIGATION_TIMEOUT_MS || 30_000));
      return this;
    } catch (cause) {
      await this.close();
      throw transientNazemError('تعذر تشغيل متصفح مزامنة ناظم.', 'NAZEM_BROWSER_START_FAILED', cause);
    }
  }

  async close() {
    await this.context?.close().catch(() => {});
    await this.browser?.close().catch(() => {});
    this.page = null;
    this.context = null;
    this.browser = null;
    this.pageClockInstalled = false;
    this.followUpApiBase = '';
    this.followUpApiHeaders = {};
    this.followUpApiPathTemplate = '';
    this.followUpApiPaths.clear();
    this.followUpPayloadCache.clear();
    this.planApiBase = '';
    this.planApiHeaders = {};
    this.planApiFirstPage = null;
    this.planDetailsCache.clear();
  }

  async getSessionState() {
    return this.context?.storageState() || null;
  }

  resetFollowUpApiSession() {
    this.followUpApiBase = '';
    this.followUpApiHeaders = {};
    this.followUpApiPathTemplate = '';
    this.followUpApiPaths.clear();
    this.followUpPayloadCache.clear();
  }

  async getPlanEditSaveButton() {
    const candidates = [
      this.page.getByRole('button', { name: /حفظ التعديلات|حفظ التغييرات|تحديث الخطة/, exact: true }).first(),
      this.page.locator('main form button[type="submit"], form button[type="submit"]').last(),
    ];
    for (const candidate of candidates) {
      try {
        await candidate.waitFor({ state: 'visible', timeout: 4_000 });
        return candidate;
      } catch {
        // يحاول المحدد الدلالي التالي قبل اعتبار عقد ناظم متغيرًا.
      }
    }
    throw reviewNazemError(
      'تعذر التعرف على زر حفظ خطة ناظم بعد تجربة البدائل الدلالية.',
      'NAZEM_PLAN_EDIT_CONTRACT_CHANGED',
    );
  }

  async login({ requireIdentity = false, forceFresh = false } = {}) {
    let stage = 'session-check';
    try {
      if (!forceFresh) {
        await this.page.goto(`${NAZEM_BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
        if (!this.page.url().includes('/login')) {
          const valid = await this.validateSession();
          if (valid) return this.getTeacherContext({ requireIdentity });
        }
      } else {
        await this.context.clearCookies();
        await this.page.goto(`${NAZEM_BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
        await this.page.evaluate(() => {
          localStorage.clear();
          sessionStorage.clear();
        });
      }
      const usernameInput = this.page.locator(SELECTORS.loginUsername).first();
      const passwordInput = this.page.locator(SELECTORS.loginPassword).first();
      stage = 'login-form';
      let loginFormReady = false;
      loginFormReady = await waitForNazemLoginForm(this, usernameInput, passwordInput);
      if (!loginFormReady) {
        throw transientNazemError('تعذر تحميل نموذج الدخول إلى ناظم.', 'NAZEM_LOGIN_FORM_TIMEOUT');
      }
      await usernameInput.fill(String(this.username || ''));
      await passwordInput.fill(String(this.password || ''));
      stage = 'login-submit';
      const loginButton = this.page.getByRole('button', {
        name: /تسجيل الدخول|دخول|login/i,
      }).first();
      await loginButton.click();
      const loginOutcome = await Promise.race([
        this.page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 }).then(() => 'connected'),
        this.page.getByText(SELECTORS.loginRejectedText).first()
          .waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'rejected'),
      ]);
      if (loginOutcome === 'rejected') {
        throw reviewNazemError(
          'رفض ناظم بيانات الدخول؛ تأكد من رقم الحساب والرمز.',
          'NAZEM_LOGIN_REJECTED',
        );
      }
      stage = 'dashboard-ready';
      await this.page.getByText(SELECTORS.teacherDashboardHeading, { exact: true }).first().waitFor();
      return this.getTeacherContext({ requireIdentity });
    } catch (cause) {
      if (cause?.name === 'NazemIntegrationError') throw cause;
      const message = cause?.message || '';
      if (/timeout|navigation|net::/i.test(message)) {
        const error = transientNazemError('تعذر الوصول إلى ناظم أو استغرق تسجيل الدخول وقتًا طويلًا.', 'NAZEM_LOGIN_TIMEOUT', cause);
        error.details = { stage };
        throw error;
      }
      throw reviewNazemError('تعذر تسجيل الدخول إلى ناظم. تحقق من بيانات الحساب وصلاحياته.', 'NAZEM_LOGIN_FAILED');
    }
  }

  async capturePlanApiSession({ forceFresh = false } = {}) {
    if (forceFresh) await this.login({ forceFresh: true });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const responsePromise = this.page.waitForResponse((response) => {
        if (response.request().method() !== 'GET') return false;
        try {
          return new URL(response.url()).pathname.endsWith('/api/educational-plans');
        } catch {
          return false;
        }
      }, { timeout: 45_000 });
      const [response] = await Promise.all([
        responsePromise,
        this.page.goto(`${NAZEM_BASE_URL}${SELECTORS.educationalPlansPath}?tab=eduPlansFollowUp`, {
          waitUntil: 'domcontentloaded',
        }),
      ]);
      if (response.status() === 401 && attempt === 0) {
        await this.login({ forceFresh: true });
        continue;
      }
      const payload = await response.json().catch(() => null);
      if (!response.ok() || !payload?.data) {
        throw transientNazemError(
          response.status() === 401
            ? 'انتهت جلسة ناظم وتعذر تجديدها تلقائيًا.'
            : 'تعذر تحميل قائمة الخطط من واجهة ناظم البرمجية.',
          response.status() === 401 ? 'NAZEM_SESSION_EXPIRED' : 'NAZEM_PLAN_API_LOAD_FAILED',
        );
      }
      const marker = '/api/educational-plans';
      this.planApiBase = response.url().slice(0, response.url().indexOf(marker));
      const requestHeaders = await response.request().allHeaders();
      this.planApiHeaders = Object.fromEntries(
        ['authorization', 'x-company-id', 'x-tenant-id', 'x-xsrf-token', 'x-csrf-token', 'accept-language']
          .filter((name) => requestHeaders[name])
          .map((name) => [name, requestHeaders[name]]),
      );
      this.planApiHeaders.origin = NAZEM_BASE_URL;
      this.planApiHeaders.referer = `${NAZEM_BASE_URL}/`;
      this.planApiFirstPage = payload;
      return payload;
    }
    throw transientNazemError(
      'انتهت جلسة ناظم وتعذر تجديدها تلقائيًا.',
      'NAZEM_SESSION_EXPIRED',
    );
  }

  async getPlanApi(path, { retryAuthentication = true } = {}) {
    if (!this.planApiBase) await this.capturePlanApiSession();
    let response;
    try {
      response = await this.context.request.get(`${this.planApiBase}${path}`, {
        headers: this.planApiHeaders,
        timeout: 60_000,
      });
    } catch (cause) {
      throw transientNazemError(
        'تعذر الاتصال بواجهة خطط ناظم البرمجية.',
        'NAZEM_PLAN_API_TIMEOUT',
        cause,
      );
    }
    if (response.status() === 401 && retryAuthentication) {
      this.planApiBase = '';
      this.planApiHeaders = {};
      this.planApiFirstPage = null;
      this.planDetailsCache.clear();
      await this.capturePlanApiSession({ forceFresh: true });
      return this.getPlanApi(path, { retryAuthentication: false });
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok() || !payload?.data) {
      throw transientNazemError(
        response.status() === 401
          ? 'انتهت جلسة ناظم وتعذر تجديدها تلقائيًا.'
          : 'رفضت واجهة ناظم البرمجية طلب قراءة الخطط.',
        response.status() === 401 ? 'NAZEM_SESSION_EXPIRED' : 'NAZEM_PLAN_API_LOAD_FAILED',
      );
    }
    return payload;
  }

  async getPlanGroupDetails(externalPlanId) {
    const key = String(externalPlanId);
    if (!this.planDetailsCache.has(key)) {
      this.planDetailsCache.set(key, this.getPlanApi(`/api/educational-plans/${key}`)
        .then((payload) => {
          if (!payload?.data?.id || !Array.isArray(payload.data.students)) {
            throw reviewNazemError(
              'تغير عقد بيانات تفاصيل خطة ناظم.',
              'NAZEM_PLAN_API_CONTRACT_CHANGED',
            );
          }
          return payload.data;
        })
        .catch((error) => {
          this.planDetailsCache.delete(key);
          throw error;
        }));
    }
    return this.planDetailsCache.get(key);
  }

  async validateSession() {
    try {
      await this.page.getByText(SELECTORS.teacherDashboardHeading, { exact: true }).first()
        .waitFor({ timeout: 12_000 });
      return !this.page.url().includes('/login');
    } catch {
      return false;
    }
  }

  async getTeacherContext({ requireIdentity = false } = {}) {
    const accountButton = this.page.getByRole('button', { name: /user avatar/ }).first();
    let rawText = '';
    try {
      rawText = String(await accountButton.innerText({ timeout: 5_000 }) || '').trim();
    } catch (cause) {
      if (requireIdentity) {
        throw reviewNazemError(
          'تعذر التحقق من هوية المعلم داخل ناظم.',
          'NAZEM_TEACHER_CONTEXT_MISSING',
          cause,
        );
      }
    }
    const withoutMarker = rawText.replace(/^user avatar\s*/i, '').trim();
    const parts = withoutMarker.split(/\n+/).map(cleanText).filter(Boolean);
    const context = {
      teacherName: parts[0] || withoutMarker,
      organizationName: parts[1] || '',
      sessionState: await this.context.storageState(),
    };
    if (requireIdentity && !context.teacherName) {
      throw reviewNazemError('تعذر التحقق من هوية المعلم داخل ناظم.', 'NAZEM_TEACHER_CONTEXT_MISSING');
    }
    return context;
  }

  async openAddPlan() {
    await this.page.goto(`${NAZEM_BASE_URL}${SELECTORS.educationalPlansPath}`, { waitUntil: 'domcontentloaded' });
    await this.page.getByRole('tab', { name: SELECTORS.addPlanTab, exact: true }).click();
    await this.page.getByRole('heading', { name: 'إنشاء خطة تعليمية', exact: true }).waitFor();
  }

  async readOpenOptions(input) {
    await input.click();
    const options = this.page.getByRole('option').filter({ visible: true });
    await options.first().waitFor();
    const rows = [];
    const count = await options.count();
    for (let index = 0; index < count; index += 1) {
      const option = options.nth(index);
      rows.push({
        index,
        id: await stableOptionId(option),
        name: cleanText(await option.innerText()),
      });
    }
    await this.page.keyboard.press('Escape');
    return rows.filter((row) => row.name);
  }

  async selectOptionFromInput(input, { id = null, name }) {
    await input.click();
    const options = this.page.getByRole('option').filter({ visible: true });
    await options.first().waitFor();
    const matches = [];
    const count = await options.count();
    for (let index = 0; index < count; index += 1) {
      const option = options.nth(index);
      const optionId = await stableOptionId(option);
      const optionName = cleanText(await option.innerText());
      if ((id && String(optionId) === String(id)) || (!id && optionName === cleanText(name))) {
        matches.push({ option, optionId });
      }
    }
    if (matches.length !== 1) {
      await this.page.keyboard.press('Escape');
      throw reviewNazemError(
        matches.length ? `يوجد أكثر من خيار باسم ${name} في ناظم.` : `تعذر العثور على ${name} في ناظم.`,
        matches.length ? 'NAZEM_OPTION_AMBIGUOUS' : 'NAZEM_OPTION_MISSING',
      );
    }
    await matches[0].option.click();
    return matches[0].optionId;
  }

  async selectOptionByPlaceholder(placeholder, optionName, { optionId = null } = {}) {
    const input = this.page.getByRole('textbox', { name: placeholder, exact: true }).first();
    return this.selectOptionFromInput(input, { id: optionId, name: optionName });
  }

  async selectOptionInContainer(container, placeholder, optionName, { optionId = null } = {}) {
    const input = container.getByRole('textbox', { name: placeholder, exact: true }).first();
    return this.selectOptionFromInput(input, { id: optionId, name: optionName });
  }

  async selectFromInput(input, optionName) {
    await input.click();
    const option = this.page.getByRole('option', { name: String(optionName), exact: true })
      .filter({ visible: true }).first();
    await option.waitFor();
    await option.click();
  }

  async dismissMemorizationEndSuggestion() {
    const dialog = this.page.getByRole('dialog').filter({ hasText: 'اقتراح نهاية خطة الحفظ' });
    try {
      await dialog.waitFor({ state: 'visible', timeout: 6_000 });
    } catch {
      return;
    }
    const reject = dialog.getByRole('button', { name: 'رفض', exact: true });
    await reject.waitFor({ state: 'visible' });
    await reject.click();
    await dialog.waitFor({ state: 'hidden' });
  }

  async chooseFirstOption(placeholder) {
    const input = this.page.getByRole('textbox', { name: placeholder, exact: true }).first();
    await input.click();
    const option = this.page.getByRole('option').filter({ visible: true }).first();
    await option.waitFor();
    const name = cleanText(await option.innerText());
    const id = await stableOptionId(option);
    await option.click();
    return { id, name };
  }

  async getStudentProfiles() {
    const matchesStudentsResponse = (response) => {
      try {
        return new URL(response.url()).pathname === '/api/students'
          && String(response.headers()['content-type'] || '').includes('json');
      } catch {
        return false;
      }
    };
    const profiles = [];
    try {
      let responsePromise = this.page.waitForResponse(matchesStudentsResponse);
      await this.page.goto(`${NAZEM_BASE_URL}${SELECTORS.studentsPath}`, { waitUntil: 'domcontentloaded' });
      let response = await responsePromise;
      for (let pageNumber = 0; pageNumber < 50; pageNumber += 1) {
        const payload = await response.json();
        const page = payload?.data || {};
        if (!Array.isArray(page.data) || Number(page.current_page) !== pageNumber + 1) {
          throw new Error('صفحات طلاب ناظم غير مكتملة أو مكررة.');
        }
        const rows = page.data;
        rows.forEach((profile) => profiles.push(normalizeNazemStudentProfile(profile)));
        if (Number(page.current_page) >= Number(page.last_page)) {
          const ids = new Set(profiles.map((profile) => profile.id));
          if (ids.size !== profiles.length || (page.total != null && Number(page.total) !== ids.size)) {
            throw new Error('قائمة طلاب ناظم غير مكتملة أو تحتوي معرّفات مكررة.');
          }
          if (profiles.some(profile => !isNazemExternalStudentId(profile.id) || !profile.name)) {
            throw new Error('قائمة طلاب ناظم تحتوي بيانات هوية ناقصة.');
          }
          return profiles;
        }
        if (!page.next_page_url) throw new Error('تعذر الوصول إلى بقية صفحات طلاب ناظم.');
        responsePromise = this.page.waitForResponse(matchesStudentsResponse);
        await this.page.getByRole('button', { name: 'Next page', exact: true }).click();
        response = await responsePromise;
      }
      throw new Error('تجاوز جلب طلاب ناظم الحد الأقصى للصفحات.');
    } catch (cause) {
      throw transientNazemError(
        'تعذر تحميل بيانات الطلاب التفصيلية من ناظم.',
        'NAZEM_STUDENT_PROFILES_FAILED',
        cause,
      );
    }
  }

  async getStudents() {
    const apiPayloads = [];
    const capture = async (response) => {
      if (!response.url().startsWith('https://api.nazem-plus.com/')) return;
      if (!String(response.headers()['content-type'] || '').includes('json')) return;
      const payload = await response.json().catch(() => null);
      if (payload) apiPayloads.push(payload);
    };
    this.page.on('response', capture);
    const students = [];
    const availableContexts = [];
    try {
      await this.openAddPlan();
      const organizationInput = this.page.getByRole('textbox', {
        name: SELECTORS.organizationPlaceholder,
        exact: true,
      }).first();
      const organizations = await this.readOpenOptions(organizationInput);
      for (const organization of organizations) {
        await this.selectOptionFromInput(organizationInput, organization);
        const circleInput = this.page.getByRole('textbox', {
          name: SELECTORS.circlePlaceholder,
          exact: true,
        }).first();
        const circles = await this.readOpenOptions(circleInput);
        for (const circle of circles) {
          await this.selectOptionFromInput(circleInput, circle);
          availableContexts.push({
            organization: { id: organization.id, name: organization.name },
            circle: { id: circle.id, name: circle.name },
          });
          const studentsInput = this.page.getByRole('textbox', {
            name: SELECTORS.studentsPlaceholder,
            exact: true,
          }).first();
          const remoteStudents = await this.readOpenOptions(studentsInput);
          remoteStudents.forEach((student) => students.push({
            externalId: student.id,
            name: student.name,
            organization: { id: organization.id, name: organization.name },
            circle: { id: circle.id, name: circle.name },
          }));
        }
      }
      await this.page.waitForTimeout(400);
    } finally {
      this.page.off('response', capture);
    }
    const namedApiObjects = apiPayloads.flatMap((payload) => collectNamedObjects(payload));
    const idForName = (name) => {
      const ids = [...new Set(namedApiObjects.filter((item) => item.name === cleanText(name)).map((item) => item.id))];
      return ids.length === 1 ? ids[0] : null;
    };
    students.forEach((student) => {
      student.organization.id ||= idForName(student.organization.name);
      student.circle.id ||= idForName(student.circle.name);
    });
    const profiles = await this.getStudentProfiles();
    return mergeNazemStudentSources(students, profiles, availableContexts);
  }

  async selectStudentContext(studentLink) {
    await this.openAddPlan();
    const organizationName = studentLink.externalOrganizationName;
    const circleName = studentLink.externalCircleName;
    if (!organizationName || !circleName) {
      throw reviewNazemError('بيانات جهة أو حلقة الطالب في ناظم غير مكتملة.', 'NAZEM_STUDENT_CONTEXT_INCOMPLETE');
    }
    await this.selectOptionByPlaceholder(SELECTORS.organizationPlaceholder, organizationName, {
      optionId: studentLink.externalOrganizationId,
    });
    await this.selectOptionByPlaceholder(SELECTORS.circlePlaceholder, circleName, {
      optionId: studentLink.externalCircleId,
    });
    await this.selectOptionByPlaceholder(SELECTORS.studentsPlaceholder, studentLink.nazemStudentName, {
      optionId: studentLink.nazemStudentId,
    });
    await this.page.getByRole('heading', { name: 'إنشاء خطة تعليمية', exact: true }).click();
  }

  normalizePlanBundle(mappedPlan) {
    if (mappedPlan?.primary) return mappedPlan;
    return { primary: mappedPlan, revision: null, startDate: null };
  }

  planBundleItems(mappedPlan) {
    const bundle = this.normalizePlanBundle(mappedPlan);
    return [bundle.primary, bundle.revision].filter(Boolean);
  }

  async readAvailablePlanOptions(mappedPlan) {
    await this.page.getByRole('tab', { name: mappedPlan.tab, exact: true }).click();
    const planCard = this.page.locator('.epc-plan-card:visible').first();
    const surahInput = planCard.getByRole('textbox', { name: SELECTORS.surahPlaceholder, exact: true }).first();
    await surahInput.click();
    const options = this.page.getByRole('option').filter({ visible: true });
    const count = await options.count();
    const surahs = [];
    for (let index = 0; index < count; index += 1) {
      surahs.push(cleanText(await options.nth(index).innerText()));
    }
    await this.page.getByRole('heading', { name: 'إنشاء خطة تعليمية', exact: true }).click();
    return { surahs: surahs.filter(Boolean) };
  }

  async getAvailablePlanOptions(studentLink, mappedPlan) {
    await this.selectStudentContext(studentLink);
    return this.readAvailablePlanOptions(mappedPlan);
  }

  async waitForPlanPreview(mappedPlan) {
    try {
      await this.page.locator('.epc-plan-stats:not(.epc-plan-stats--loading):visible')
        .filter({ hasText: 'عدد الأوجه:' })
        .last()
        .waitFor({ state: 'visible', timeout: 12_000 });
    } catch (cause) {
      throw reviewNazemError(
        `تعذر حساب أوجه خطة ${mappedPlan.tab} في ناظم؛ لن تُحفظ خطة بلا ورد مجدول.`,
        'NAZEM_PLAN_PREVIEW_MISSING',
        cause,
      );
    }
  }

  async fillPlanForm(mappedPlan) {
    const available = await this.readAvailablePlanOptions(mappedPlan);
    for (const surah of [mappedPlan.startSurah, mappedPlan.endSurah]) {
      if (!available.surahs.includes(surah)) {
        throw blockedNazemError(`سورة ${surah} غير متاحة لهذا الطالب حاليًا في ناظم.`, 'NAZEM_SURAH_UNAVAILABLE');
      }
    }
    await this.page.getByRole('tab', { name: mappedPlan.tab, exact: true }).click();
    const planCard = this.page.locator('.epc-plan-card:visible').first();
    if (mappedPlan.tab !== 'المراجعة') {
      await this.selectOptionInContainer(planCard, SELECTORS.amountPlaceholder, mappedPlan.amount);
    }
    if (mappedPlan.tab === 'الحفظ') {
      await this.selectOptionInContainer(planCard, SELECTORS.directionPlaceholder, mappedPlan.direction);
    }
    const surahInputs = planCard.getByRole('textbox', { name: SELECTORS.surahPlaceholder, exact: true });
    await surahInputs.nth(0).click();
    await this.page.getByRole('option', { name: mappedPlan.startSurah, exact: true }).click();
    const ayahInputs = planCard.getByRole('textbox', { name: SELECTORS.ayahPlaceholder, exact: true });
    await ayahInputs.nth(0).click();
    await this.page.getByRole('option', { name: String(mappedPlan.startAyah), exact: true }).click();
    if (mappedPlan.tab === 'الحفظ') await this.dismissMemorizationEndSuggestion();
    await surahInputs.nth(1).click();
    await this.page.getByRole('option', { name: mappedPlan.endSurah, exact: true }).click();
    await ayahInputs.nth(1).click();
    await this.page.getByRole('option', { name: String(mappedPlan.endAyah), exact: true }).click();
    const numericInputs = planCard.getByRole('spinbutton');
    if (await numericInputs.count() >= 2) {
      await numericInputs.nth(0).fill(String(mappedPlan.repeatCount));
      await numericInputs.nth(1).fill(String(mappedPlan.linkCount));
    }
    await this.waitForPlanPreview(mappedPlan);
  }

  async createPlan(studentLink, mappedPlan) {
    const bundle = this.normalizePlanBundle(mappedPlan);
    await this.selectStudentContext(studentLink);
    for (const item of this.planBundleItems(bundle)) {
      await this.fillPlanForm(item);
    }
    const saveButton = this.page.getByRole('button', { name: SELECTORS.saveButton, exact: true });
    if (await saveButton.isDisabled()) {
      throw reviewNazemError('نموذج خطة ناظم غير مكتمل بعد التحويل ويحتاج مراجعة.', 'NAZEM_FORM_INCOMPLETE');
    }
    await saveButton.click();
    const confirmation = this.page.getByRole('button', { name: SELECTORS.confirmSaveButton, exact: true });
    await confirmation.waitFor({ state: 'visible' });
    await confirmation.click();
    await this.page.getByRole('alert').filter({ hasText: SELECTORS.createSuccessText }).waitFor({ state: 'visible' });
    const verified = await this.verifyPlan(studentLink, bundle);
    if (!verified) {
      throw reviewNazemError('لم نستطع التحقق من حفظ الخطة في ناظم.', 'NAZEM_SUCCESS_UNVERIFIED');
    }
    return verified;
  }

  async listPlanGroups() {
    const groups = new Map();
    let planApiError = null;
    for (let apiAttempt = 0; apiAttempt < 2; apiAttempt += 1) {
      try {
        let payload = this.planApiFirstPage || await this.capturePlanApiSession({ forceFresh: apiAttempt > 0 });
        await collectPlanApiPages(this, payload, groups);
        return [...groups.values()];
      } catch (error) {
        planApiError = error;
        groups.clear();
        this.planApiBase = '';
        this.planApiHeaders = {};
        this.planApiFirstPage = null;
      }
    }

    await this.page.goto(`${NAZEM_BASE_URL}${SELECTORS.educationalPlansPath}?tab=eduPlansFollowUp`, { waitUntil: 'domcontentloaded' });
    await this.page.getByText('جاري التحميل...', { exact: true }).waitFor({ state: 'hidden' }).catch(() => {});
    const groupPageSignatures = new Set();
    for (let pageNumber = 0; pageNumber < 50; pageNumber += 1) {
      let rows = this.page.getByRole('row');
      let firstDataRow = 1;
      if (await rows.count() <= 1) {
        rows = this.page.locator('table:visible').last().locator('tbody > tr');
        firstDataRow = 0;
      }
      const pageGroups = [];
      const count = await rows.count();
      await collectVisiblePlanGroups(firstDataRow, count, rows, pageGroups);
      const signature = pageGroups.map((group) => group.externalId).join(',');
      if (groupPageSignatures.has(signature)) break;
      groupPageSignatures.add(signature);
      pageGroups.forEach((group) => groups.set(group.externalId, group));
      const nextPage = this.page.getByRole('button', { name: 'Next page', exact: true }).last();
      if (!await nextPage.count() || await nextPage.isDisabled()) break;
      await nextPage.click();
      await this.page.waitForTimeout(500);
    }
    await assertPlanListLoaded(this, groups, planApiError);
    return [...groups.values()];
  }

  async getPlanStudentIdentities() {
    const students = this.page.locator('.epe-student');
    const identities = [];
    const count = await students.count();
    await collectNazemStudentIdentities(count, students, identities);
    return identities;
  }

  async getUniqueStudentContainer(studentLink) {
    const identities = await this.getPlanStudentIdentities();
    return resolveNazemPlanStudentIdentity(identities, studentLink).container;
  }

  async readPlanFromDom(externalPlanId, studentLink, expectedTab, { navigate = true } = {}) {
    if (navigate) {
      await this.page.goto(`${NAZEM_BASE_URL}${SELECTORS.educationalPlansPath}/${externalPlanId}/edit`, { waitUntil: 'domcontentloaded' });
      await this.getPlanEditSaveButton();
    }
    try {
      const student = await this.getUniqueStudentContainer(studentLink);
      await student.waitFor({ state: 'visible', timeout: 10_000 });
      const planContainer = student.locator('.epe-item').filter({ hasText: planCardLabel(expectedTab) }).first();
      if (!await planContainer.count()) return null;
      const textboxes = planContainer.getByRole('textbox');
      if (await textboxes.count() < 4) {
        throw reviewNazemError('تغيرت بنية حقول قراءة خطة ناظم.', 'NAZEM_PLAN_EDIT_FIELDS_CHANGED');
      }
      const numbers = planContainer.getByRole('spinbutton');
      const amountButton = planContainer.getByRole('button', { name: /ربع وجه|نصف وجه|وجه كامل|وجه ونصف|وجهين/ }).first();
      const startDateInput = this.page.locator('input[type="date"]').first();
      const text = cleanText(await planContainer.innerText());
      return {
        externalId: String(externalPlanId),
        studentName: studentLink.nazemStudentName,
        tab: expectedTab,
        amount: await amountButton.count() ? cleanText(await amountButton.innerText()) : null,
        direction: /تصاعدي|تنازلي/.exec(text)?.[0] || null,
        startSurah: cleanText(await textboxes.nth(0).inputValue()),
        startAyah: Number(await textboxes.nth(1).inputValue()),
        endSurah: cleanText(await textboxes.nth(2).inputValue()),
        endAyah: Number(await textboxes.nth(3).inputValue()),
        repeatCount: await numbers.count() ? Number(await numbers.nth(0).inputValue()) : null,
        linkCount: await numbers.count() > 1 ? Number(await numbers.nth(1).inputValue()) : null,
        startDate: await startDateInput.count() ? await startDateInput.inputValue() : null,
        text,
      };
    } catch (error) {
      if (error?.code === 'NAZEM_PLAN_STUDENT_MISMATCH') return null;
      throw error;
    }
  }

  async readPlan(externalPlanId, studentLink, expectedTab, { navigate = true } = {}) {
    try {
      const details = await this.getPlanGroupDetails(externalPlanId);
      const bundle = mapNazemApiPlanBundle(details, studentLink);
      if (!bundle) return null;
      if (bundle.primary?.tab === expectedTab) return bundle.primary;
      if (bundle.revision?.tab === expectedTab) return bundle.revision;
      return null;
    } catch (apiError) {
      try {
        return await this.readPlanFromDom(externalPlanId, studentLink, expectedTab, { navigate });
      } catch (domError) {
        if (domError?.name === 'NazemIntegrationError') throw domError;
        throw apiError;
      }
    }
  }

  async findPlan(studentLink, mappedPlan = null) {
    const groups = await this.listPlanGroups();
    const candidates = groups.filter((group) => (
      (!studentLink.externalOrganizationName || group.text.includes(studentLink.externalOrganizationName))
      && (!studentLink.externalCircleName || group.text.includes(studentLink.externalCircleName))
    ));
    for (const group of candidates) {
      const plan = await this.readPlan(group.externalId, studentLink, mappedPlan?.tab || 'الحفظ');
      if (plan) return plan;
    }
    return null;
  }

  async readPlanBundle(externalPlanId, studentLink, mappedPlan) {
    const bundle = this.normalizePlanBundle(mappedPlan);
    const primary = await this.readPlan(externalPlanId, studentLink, bundle.primary.tab);
    if (!primary) return null;
    const revision = bundle.revision
      ? await this.readPlan(externalPlanId, studentLink, bundle.revision.tab)
      : null;
    if (bundle.revision && !revision) return null;
    return { externalId: String(externalPlanId), primary, revision };
  }

  async findPlanBundle(studentLink, mappedPlan) {
    const groups = await this.listPlanGroups();
    const candidates = groups.filter((group) => (
      (!studentLink.externalOrganizationName || group.text.includes(studentLink.externalOrganizationName))
      && (!studentLink.externalCircleName || group.text.includes(studentLink.externalCircleName))
    ));
    for (const group of candidates) {
      const plan = await this.readPlanBundle(group.externalId, studentLink, mappedPlan);
      if (plan && nazemPlanBundleMatches(plan, this.normalizePlanBundle(mappedPlan))) return plan;
    }
    return null;
  }

  async verifyPlan(studentLink, mappedPlan) {
    await this.page.waitForTimeout(600);
    return this.findPlanBundle(studentLink, mappedPlan);
  }

  async discoverStudentPlans(remoteStudents = [], { onProgress = null, includeMissingStudents = true } = {}) {
    let discoveredStudents = [...remoteStudents];
    const groups = await this.listPlanGroups();
    const discovered = [];
    const issues = [];
    const totalProgressUnits = Math.max(1, groups.length * 8);
    let completedProgressUnits = 0;
    const reportProgress = async () => {
      completedProgressUnits += 1;
      if (onProgress) await onProgress(completedProgressUnits, totalProgressUnits);
    };
    for (const group of groups) {
      try {
      const followUpHistory = [];
      await collectRecentFollowUpHistory(this, group, reportProgress, followUpHistory);
      const scopedCandidates = remoteStudents.filter((student) => (
        (!student.organization?.name || group.text.includes(student.organization.name))
        && (!student.circle?.name || group.text.includes(student.circle.name))
      ));
      let planDetails = null;
      let planStudentIds;
      let fallbackStudentNames;
      try {
        planDetails = await this.getPlanGroupDetails(group.externalId);
        planStudentIds = new Set(planDetails.students
          .map((student) => student?.student_id)
          .filter(Boolean)
          .map(String));
        fallbackStudentNames = new Set(planDetails.students
          .filter((student) => !student?.student_id)
          .map((student) => normalizeArabicPersonName(student?.student_name)));
      } catch {
        await this.page.goto(`${NAZEM_BASE_URL}${SELECTORS.educationalPlansPath}/${group.externalId}/edit`, { waitUntil: 'domcontentloaded' });
        await this.getPlanEditSaveButton();
        const planStudents = this.page.locator('.epe-student');
        await planStudents.first().waitFor({ state: 'visible' });
        if (group.studentCount > 1) {
          await this.page.waitForFunction(
            (expectedCount) => document.querySelectorAll('.epe-student').length >= expectedCount,
            group.studentCount,
          );
        }
        const planStudentIdentities = await this.getPlanStudentIdentities();
        if (includeMissingStudents) {
          discoveredStudents = includeNazemPlanStudents(discoveredStudents, planStudentIdentities.map(identity => ({
            student_id: identity.externalId, student_name: identity.name,
          })), group);
        }
        planStudentIds = new Set(planStudentIdentities
          .map((identity) => identity.externalId)
          .filter(Boolean)
          .map(String));
        fallbackStudentNames = new Set(planStudentIdentities
          .filter((identity) => !identity.externalId)
          .map((identity) => identity.normalizedName));
      }
      if (includeMissingStudents && planDetails) {
        discoveredStudents = includeNazemPlanStudents(discoveredStudents, planDetails.students, group);
      }
      const groupCandidates = discoveredStudents;
      const candidates = groupCandidates.filter((student) => (
        (isNazemExternalStudentId(student.externalId) && planStudentIds.has(String(student.externalId)))
        || ((!scopedCandidates.length || scopedCandidates.includes(student))
          && fallbackStudentNames.has(normalizeArabicPersonName(student.name)))
      ));
      await discoverCandidatePlans({ adapter: this, candidates, planDetails, group, followUpHistory, discovered, issues });
      await reportProgress();
      } catch (error) {
        issues.push({
          groupExternalId: String(group.externalId),
          studentExternalId: '',
          studentName: '',
          errorCode: error?.code || 'NAZEM_PLAN_GROUP_DISCOVERY_FAILED',
          message: String(error?.message || 'تعذرت قراءة مجموعة خطط من ناظم.').slice(0, 500),
        });
        await reportProgress();
      }
    }
    return { plans: discovered, issues, students: discoveredStudents };
  }

  async datedLateItems(item, externalPlanId, studentLink, remoteType) {
    const result = [];
    for (const late of normalizeNazemFollowUpItems(item?.late_items)) {
      if (normalizeDateOnly(late.source_date)) {
        result.push({ ...late, date: normalizeDateOnly(late.source_date) });
        continue;
      }
      if (normalizeDateOnly(late.date || late.follow_up_date || late.task_date || late.scheduled_date) || !late.source_day_id) {
        result.push(late);
        continue;
      }
      const key = JSON.stringify([externalPlanId, studentLink.nazemStudentId, remoteType, late.source_day_id]);
      let date = this.lateSourceDates.get(key)
        || await this.resolveLateSourceDate?.({ externalPlanId, studentLink, remoteType, sourceDayId: late.source_day_id });
      // Availability is only the search boundary, never the original task date.
      const boundary = normalizeDateOnly(late.available_date) || saudiDate();
      for (let offset = 0; !date && offset < 14; offset += 1) {
        const candidate = new Date(`${boundary}T12:00:00Z`);
        candidate.setUTCDate(candidate.getUTCDate() - offset);
        const candidateDate = candidate.toISOString().slice(0, 10);
        const payload = await this.openFollowUp(externalPlanId, candidateDate);
        const { day } = findFollowUpDay(payload, studentLink, remoteType);
        if (String(day?.id) === String(late.source_day_id)) date = normalizeDateOnly(day.date) || candidateDate;
      }
      if (!date) throw reviewNazemError('تعذر العثور على اليوم الأصلي للإكمال المتأخر في ناظم.', 'NAZEM_LATE_SOURCE_MISSING');
      this.lateSourceDates.set(key, date);
      result.push({ ...late, date });
    }
    return result;
  }

  async readStudentFollowUpHistory(externalPlanId, studentLink, days = 7, { endDate = null, confirmedRecordIds = [], freshCurrent = true } = {}) {
    const rows = [];
    const scheduled = new Map();
    const attendance = [];
    // Historical reads can regenerate pending days in Nazem. Capture current identity last.
    for (let daysAgo = Math.max(1, Number(days || 7)) - 1; daysAgo >= 0; daysAgo -= 1) {
      const date = endDate ? shiftDateOnly(endDate, -daysAgo) : saudiDate(daysAgo);
      const payload = await this.openFollowUp(externalPlanId, date, { fresh: daysAgo === 0 && (freshCurrent || Number(days) > 1) });
      const { student: attendanceStudent } = findFollowUpDay(payload, studentLink, 'conserve');
      if ([2, 3, 4, 5].includes(Number(attendanceStudent?.attendance_status))) {
        attendance.push({ date, attendanceStatus: Number(attendanceStudent.attendance_status) });
      }
      await collectRemoteFollowUpTypes({ adapter: this, payload, studentLink, confirmedRecordIds, daysAgo, endDate, externalPlanId, date, scheduled, rows });
    }
    const queueDate = endDate || saudiDate();
    for (const remoteType of ['conserve', 'revision', 'master']) {
      const pending = [...scheduled.values()].filter(day => day.remoteType === remoteType)
        .sort((first, second) => String(second.date).localeCompare(String(first.date)));
      const late = pending.filter(day => day.nazemLate).sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const blocked = pending.filter(day => day.nazemPendingDay).sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const overdueDates = [late[0]?.date, blocked[0]?.date].filter(Boolean).sort((first, second) => String(first).localeCompare(String(second)));
      const actionableDate = remoteType === 'revision' ? queueDate : overdueDates[0] || pending[0]?.date || null;
      for (const day of [...rows, ...pending].filter(day => day.remoteType === remoteType)) {
        day.nazemQueueDate = queueDate;
        day.nazemActionableDate = actionableDate;
        day.nazemLinkDate = actionableDate;
      }
    }
    return {
      followUps: rows,
      scheduledFollowUps: [...scheduled.values()].sort((first, second) => (
        String(first.date).localeCompare(String(second.date))
      )),
      attendance,
    };
  }

  async updatePlanForm(studentLink, mappedPlan) {
    const student = await this.getUniqueStudentContainer(studentLink);
    await student.waitFor({ state: 'visible', timeout: 10_000 });
    const planContainer = student.locator('.epe-item').filter({ hasText: planCardLabel(mappedPlan.tab) }).first();
    if (!await planContainer.count()) {
      throw reviewNazemError(
        `مجموعة ناظم الحالية لا تحتوي خطة ${mappedPlan.tab}، ولا يمكن إضافتها بأمان من شاشة التعديل.`,
        'NAZEM_PLAN_TRACK_MISSING',
      );
    }
    const textboxes = planContainer.getByRole('textbox');
    if (await textboxes.count() < 4) {
      throw reviewNazemError('تغيرت بنية حقول تعديل خطة ناظم.', 'NAZEM_PLAN_EDIT_FIELDS_CHANGED');
    }
    const range = [mappedPlan.startSurah, mappedPlan.startAyah, mappedPlan.endSurah, mappedPlan.endAyah];
    await updateUnlockedPlanRange(this, range, textboxes);
    const numbers = planContainer.getByRole('spinbutton');
    if (await numbers.count() >= 2) {
      if (!await numbers.nth(0).isDisabled()) await numbers.nth(0).fill(String(mappedPlan.repeatCount));
      if (!await numbers.nth(1).isDisabled()) await numbers.nth(1).fill(String(mappedPlan.linkCount));
    }
    const amountButton = planContainer.getByRole('button', { name: /ربع وجه|نصف وجه|وجه كامل|وجه ونصف|وجهين/ }).first();
    if (await amountButton.count() && await amountButton.isEnabled()) {
      await amountButton.click();
      await this.page.getByRole('option', { name: mappedPlan.amount, exact: true }).click();
    }
  }

  async updatePlan(studentLink, mappedPlan, externalPlanId) {
    if (!externalPlanId) {
      throw reviewNazemError('لم يتوفر معرف ثابت للخطة المقابلة في ناظم؛ لن ننشئ خطة مكررة.', 'NAZEM_PLAN_ID_MISSING');
    }
    const bundle = this.normalizePlanBundle(mappedPlan);
    const current = await this.readPlanBundle(externalPlanId, studentLink, bundle);
    if (current && nazemPlanBundleMatches(current, bundle)) return current;
    await this.page.goto(`${NAZEM_BASE_URL}${SELECTORS.educationalPlansPath}/${externalPlanId}/edit`, { waitUntil: 'domcontentloaded' });
    const save = await this.getPlanEditSaveButton();
    for (const item of this.planBundleItems(bundle)) {
      await this.updatePlanForm(studentLink, item);
    }
    if (await save.isDisabled()) return this.readPlanBundle(externalPlanId, studentLink, bundle);
    await save.click();
    await this.page.getByRole('alert').filter({ hasText: SELECTORS.updateSuccessText }).waitFor({ state: 'visible' });
    return this.readPlanBundle(externalPlanId, studentLink, bundle);
  }

  async deletePlan(studentLink, externalPlanId) {
    if (!externalPlanId) return { alreadyRemoved: true };
    const response = await this.page.goto(`${NAZEM_BASE_URL}${SELECTORS.educationalPlansPath}/${externalPlanId}/edit`, {
      waitUntil: 'domcontentloaded',
    });
    if (response?.status() === 404) return { alreadyRemoved: true };
    const save = await this.getPlanEditSaveButton();
    try {
      await save.waitFor({ state: 'visible', timeout: 10_000 });
    } catch (cause) {
      if (!this.page.url().includes(`/${externalPlanId}/edit`)) return { alreadyRemoved: true };
      throw reviewNazemError(
        'تعذر التحقق من شاشة حذف خطة ناظم؛ قد تكون بنية الصفحة تغيرت.',
        'NAZEM_PLAN_DELETE_FORM_CHANGED',
        { cause: cause?.message },
      );
    }
    const student = await this.getUniqueStudentContainer(studentLink);
    let itemCount = await student.locator('.epe-item').count();
    if (!itemCount) return { alreadyRemoved: true };
    while (itemCount > 0) {
      const deleteButtons = student.locator('.epe-item__delete');
      if (!await deleteButtons.count()) {
        throw reviewNazemError(
          'تحتوي خطة ناظم على متابعة محفوظة، لذلك لا يسمح ناظم بحذفها تلقائيًا.',
          'NAZEM_EXTERNAL_DELETE_BLOCKED',
        );
      }
      await deleteButtons.first().click();
      const dialog = this.page.getByRole('dialog').filter({ hasText: /حذف.*الخطة/ });
      await dialog.waitFor({ state: 'visible' });
      const confirm = dialog.getByRole('button', { name: /تأكيد|حذف/ }).last();
      await confirm.click();
      await this.page.waitForTimeout(400);
      const nextCount = await student.locator('.epe-item').count();
      if (nextCount >= itemCount) {
        throw reviewNazemError('لم يؤكد ناظم حذف بند الخطة.', 'NAZEM_EXTERNAL_DELETE_UNVERIFIED');
      }
      itemCount = nextCount;
    }
    return { externalId: String(externalPlanId), deleted: true };
  }

  async readFollowUpApi(path) {
    let response;
    try {
      response = await this.context.request.get(`${this.followUpApiBase}${path}`, {
        headers: this.followUpApiHeaders,
        timeout: 20_000,
      });
    } catch (cause) {
      throw transientNazemError(
        'تعذر تحميل متابعة الخطة من ناظم.',
        'NAZEM_FOLLOW_UP_LOAD_FAILED',
        cause,
      );
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok() || !payload?.status) {
      const remoteMessage = cleanText(payload?.message || payload?.error || '');
      throw transientNazemError(
        'تعذر تحميل متابعة الخطة من ناظم.',
        'NAZEM_FOLLOW_UP_LOAD_FAILED',
        new Error([`HTTP ${response.status()}`, remoteMessage].filter(Boolean).join(' ')),
      );
    }
    return payload;
  }

  async openFollowUp(externalPlanId, date, { fresh = false, retryAuthentication = true } = {}) {
    if (!externalPlanId) {
      throw reviewNazemError('معرف مجموعة الخطة في ناظم غير موجود.', 'NAZEM_PLAN_ID_MISSING');
    }
    const normalizedDate = normalizeDateOnly(date);
    if (!normalizedDate) {
      throw reviewNazemError('تاريخ متابعة التسميع في المنصة غير صالح.', 'RUWASI_FOLLOW_UP_DATE_INVALID');
    }
    const cacheKey = `${externalPlanId}:${normalizedDate}`;
    if (!fresh && this.followUpPayloadCache.has(cacheKey)) {
      return this.followUpPayloadCache.get(cacheKey);
    }
    const fixedTime = `${normalizedDate}T12:00:00+03:00`;
    if (!this.pageClockInstalled) {
      await this.page.clock.install({ time: new Date(fixedTime) });
      this.pageClockInstalled = true;
    } else {
      await this.page.clock.setFixedTime(new Date(fixedTime));
    }
    const directPath = this.followUpApiPaths.get(cacheKey)
      || (this.followUpApiPathTemplate
        ? this.followUpApiPathTemplate
          .replace('{planId}', encodeURIComponent(String(externalPlanId)))
          .replace('{date}', encodeURIComponent(normalizedDate))
        : '');
    if (this.followUpApiBase && directPath) return readCachedFollowUpPath({ adapter: this, directPath, cacheKey, retryAuthentication, externalPlanId, normalizedDate });
    let response;
    try {
      [response] = await Promise.all([
        this.page.waitForResponse((candidate) => (
          candidate.request().method() === 'GET'
          && candidate.url().startsWith('https://api.nazem-plus.com/')
          && candidate.url().includes(`/educational-plans/${externalPlanId}/follow-up`)
        ), { timeout: 30_000 }),
        this.page.goto(`${NAZEM_BASE_URL}/educational-plans/${externalPlanId}/follow-up`, {
          waitUntil: 'domcontentloaded',
        }),
      ]);
    } catch (cause) {
      if (retryAuthentication && this.page.url().includes('/login')) {
        this.resetFollowUpApiSession();
        await this.login({ forceFresh: true });
        return this.openFollowUp(externalPlanId, normalizedDate, { fresh: true, retryAuthentication: false });
      }
      throw transientNazemError(
        'تعذر تحميل متابعة الخطة من ناظم.',
        'NAZEM_FOLLOW_UP_LOAD_FAILED',
        new Error(`${String(cause?.message || '').split('\n')[0]} page=${this.page.url()}`),
      );
    }
    const payload = await response.json().catch(() => null);
    if ([401, 419].includes(response.status()) && retryAuthentication) {
      this.resetFollowUpApiSession();
      await this.login({ forceFresh: true });
      return this.openFollowUp(externalPlanId, normalizedDate, { fresh: true, retryAuthentication: false });
    }
    assertFollowUpResponse(response, payload);
    await cacheFollowUpApiSession({ adapter: this, response, externalPlanId, normalizedDate, cacheKey, payload });
    return payload;
  }

  async postFollowUpApi(path, payload = {}) {
    if (!this.followUpApiBase) {
      throw reviewNazemError('تعذر تحديد مسار واجهة متابعة ناظم.', 'NAZEM_FOLLOW_UP_API_MISSING');
    }
    const response = await this.context.request.post(`${this.followUpApiBase}${path}`, {
      // Request JSON validation errors instead of Laravel's HTML redirects.
      headers: { ...this.followUpApiHeaders, accept: 'application/json' },
      data: payload,
      maxRedirects: 0,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok() || !data?.status) {
      const remoteDetails = data?.errors || data?.data || null;
      const cause = new Error([
        `HTTP ${response.status()}`,
        `sent=${Object.keys(this.followUpApiHeaders).join(',')}`,
        `keys=${Object.keys(data || {}).slice(0, 8).join(',')}`,
        remoteDetails ? JSON.stringify(remoteDetails).slice(0, 500) : '',
      ].filter(Boolean).join(' '));
      throw nazemWriteFailure(response.status(), cleanText(data?.message), cause);
    }
    return data;
  }

  async readStudentFollowUp(studentLink, planLink, date, options = {}) {
    let payload = await this.openFollowUp(planLink.nazemPlanId, date, options);
    if (resolveNazemApiPlanStudent(responseData(payload), studentLink)) return payload;
    if (!options.fresh) {
      payload = await this.openFollowUp(planLink.nazemPlanId, date, { fresh: true });
      if (resolveNazemApiPlanStudent(responseData(payload), studentLink)) return payload;
    }
    // A student absent from today's follow-up can still belong to the plan.
    // Verify the current plan instead of suggesting a destructive relink.
    this.planDetailsCache.delete(String(planLink.nazemPlanId));
    const details = await this.getPlanGroupDetails(planLink.nazemPlanId);
    if (resolveNazemApiPlanStudent(details, studentLink)) {
      const activity = await readNazemStudentActivity(path => this.getPlanApi(path), studentLink.nazemStudentId);
      if (activity === 'inactive') {
        throw blockedNazemError('الطالب مصنف «غير مستمر» في ناظم، لذلك لا يظهر في المتابعة. يلزم اعتماد إعادته إلى «مستمر» في ناظم قبل إعادة المزامنة.', 'NAZEM_STUDENT_INACTIVE');
      }
      throw blockedNazemError(
        'الطالب موجود في خطة ناظم لكنه غير ظاهر في متابعة هذا التاريخ. راجع المتابعة في ناظم ثم أعد المزامنة؛ النتيجة محفوظة.',
        'NAZEM_FOLLOW_UP_STUDENT_MISSING',
      );
    }
    throw reviewNazemError('الطالب غير موجود في تفاصيل مجموعة خطة ناظم الحالية. راجع ربطه قبل إعادة المزامنة.', 'NAZEM_PLAN_STUDENT_MISMATCH');
  }

  async submitAttendance(studentLink, planLink, { date, attendanceStatus, explicitChange = false }) {
    const payload = await this.readStudentFollowUp(studentLink, planLink, date);
    const { student } = findFollowUpDay(payload, studentLink, 'conserve');
    if (!student) {
      throw reviewNazemError('مجموعة خطة ناظم لا تحتوي الطالب المرتبط.', 'NAZEM_PLAN_STUDENT_MISMATCH');
    }
    if ([2, 3, 4, 5].includes(Number(student.attendance_status))
      && (!explicitChange || Number(student.attendance_status) === Number(attendanceStatus))) {
      return { attendanceStatus: Number(student.attendance_status), authoritative: true };
    }
    await this.postFollowUpApi(`/educational-plans/${planLink.nazemPlanId}/attendance`, {
      student_id: Number(studentLink.nazemStudentId),
      attendance_status: Number(attendanceStatus),
      date,
    });
    const refreshed = await this.openFollowUp(planLink.nazemPlanId, date, { fresh: true });
    const verified = findFollowUpDay(refreshed, studentLink, 'conserve').student;
    if (!verified || Number(verified.attendance_status) !== Number(attendanceStatus)) {
      throw reviewNazemError('حُفظ الحضور في ناظم لكن تعذر التحقق منه.', 'NAZEM_ATTENDANCE_UNVERIFIED');
    }
    return { attendanceStatus: Number(verified.attendance_status) };
  }

  async resolveRecitationFollowUp(studentLink, planLink, mapped, { fresh = true } = {}) {
    const followUpDate = saudiDate();
    const payload = await this.readStudentFollowUp(studentLink, planLink, followUpDate, { fresh });
    const current = findFollowUpDay(payload, studentLink, mapped.remoteType || 'conserve', { sourceDayId: mapped.nazemSourceDayId, sourceItemId: mapped.nazemSavedTarget?.nazemItemId });
    const carriesBacklog = mapped.taskType !== 'link' && mapped.remoteType !== 'revision';
    const late = carriesBacklog ? findMatchingNazemLate(normalizeNazemFollowUpItems(current.item?.late_items), mapped) : null;
    if (late) return { ...current, payload, late, followUpDate };
    const pendingDay = current.item?.pending_day;
    if (carriesBacklog && current.item?.is_blocked_by_previous_days && matchesNazemTarget(pendingDay, mapped, followUpDate)) {
      return { ...current, day: pendingDay, payload, late: null, followUpDate, pendingDay: true };
    }
    if (matchesNazemTarget(current.day, mapped, followUpDate)) {
      return { ...current, payload, late: null, followUpDate };
    }
    if (mapped.date !== followUpDate) {
      const historical = await this.readStudentFollowUp(studentLink, planLink, mapped.date, { fresh });
      const target = findFollowUpDay(historical, studentLink, mapped.remoteType || 'conserve', { sourceDayId: mapped.nazemSourceDayId, sourceItemId: mapped.nazemSavedTarget?.nazemItemId });
      if (matchesNazemTarget(target.day, mapped, mapped.date)) {
        return { ...target, payload: historical, late: null, followUpDate: mapped.date,
          executionAttendanceStatus: current.student?.attendance_status, executionDate: followUpDate };
      }
      const replacement = await this.resolveRegeneratedRecitation(studentLink, planLink, mapped, target, mapped.date);
      if (replacement) return { ...replacement,
        executionAttendanceStatus: current.student?.attendance_status, executionDate: followUpDate };
    }
    // Never reuse a current snapshot after navigating to a historical date.
    const replacement = mapped.date === followUpDate
      ? await this.resolveRegeneratedRecitation(studentLink, planLink, mapped, current, followUpDate) : null;
    if (replacement) return replacement;
    // A stored snapshot alone never replaces independent remote verification.
    if (mapped.nazemSourceDayId || current.day) {
      const missingCycle = mapped.taskType === 'review' && !mapped.nazemSavedTarget?.nazemItemId;
      const message = missingCycle
        ? 'التقييم القديم محفوظ دون رقم دورة المراجعة، وتغيّر رقم سجل المتابعة في ناظم. يلزم إثبات دورته الأصلية؛ هذا لا يعني تغيّر خطة الطالب.'
        : 'تعذر مطابقة سجل ناظم الأصلي بالتقييم المحفوظ. النتيجة محفوظة وتحتاج مطابقة.';
      const error = reviewNazemError(message, 'NAZEM_SAVED_TARGET_CHANGED');
      error.details = { stage: 'target-resolution', expectedRecordId: mapped.nazemSourceDayId,
        observedRecordId: current.day?.id, taskDate: mapped.date,
        reason: missingCycle ? 'original-cycle-missing' : 'original-target-unmatched' };
      throw error;
    }
    return { ...current, payload, late: null, followUpDate };
  }

  async resolveRegeneratedRecitation(studentLink, planLink, mapped, target, followUpDate) {
    const replacement = findRegeneratedPendingDay(normalizeNazemFollowUpItems(target.student?.items), mapped);
    if (replacement) {
      const replacementId = String(replacement.day.id);
      // A second independent read must still identify the same unique pending day.
      const checked = await this.readStudentFollowUp(studentLink, planLink, followUpDate, { fresh: true });
      const verified = findFollowUpDay(checked, studentLink, mapped.remoteType);
      const confirmed = findRegeneratedPendingDay(normalizeNazemFollowUpItems(verified.student?.items), mapped);
      if (confirmed && String(confirmed.day.id) === replacementId) {
        return { ...verified, ...confirmed, payload: checked, late: null, followUpDate,
          replacedRecordId: mapped.nazemSourceDayId };
      }
    }
    return null;
  }

  async readRecitationAuthority(studentLink, planLink, mapped) {
    const { student, item, day, late, followUpDate, executionAttendanceStatus, executionDate } = await this.resolveRecitationFollowUp(studentLink, planLink, mapped);
    if (!student) throw reviewNazemError('مجموعة خطة ناظم لا تحتوي الطالب المرتبط.', 'NAZEM_PLAN_STUDENT_MISMATCH');
    if (!item) throw reviewNazemError('خطة الطالب في ناظم لا تحتوي نوع الورد المرتبط.', 'NAZEM_PLAN_TRACK_MISSING');
    const attendanceValue = executionDate ? executionAttendanceStatus : student.attendance_status;
    const attendanceStatus = [2, 3, 4, 5].includes(Number(attendanceValue)) ? Number(attendanceValue) : null;
    const _resolveDay = () => {
      if (day) {
        return { ...day, ...(item?.id ? { nazemItemId: String(item.id) } : {}), date: mapped.date, remoteType: mapped.remoteType,
        taskType: mapped.remoteType === 'revision' ? 'review' : 'memorization', attendanceStatus };
      }
      return null;
    };
    return {
      attendanceStatus,
      attendanceDate: executionDate || followUpDate,
      linkAlreadyRecorded: Boolean(mapped.taskType === 'link' && FINAL_FOLLOW_UP_STATUSES.has(String(day?.status || ''))
        && Object.hasOwn(day, 'link') && Number(day.link) === Number(mapped.linkCount)),
      linkRecordId: day?.id,
      final: Boolean(mapped.taskType !== 'link' && !late && day && FINAL_FOLLOW_UP_STATUSES.has(String(day.status || ''))),
      day: _resolveDay(),
    };
  }

  async verifyRecitation(payload, studentLink, mapped, identifiedDay = null) {
    const { student, day: today } = findFollowUpDay(payload, studentLink, mapped.remoteType);
    const day = identifiedDay || today;
    let result;
    try {
      result = verifyFinalFollowUp(day, mapped);
    } catch (cause) {
      const hasAttendance = Object.hasOwn(student || {}, 'attendance_status')
        && student.attendance_status !== null
        && student.attendance_status !== '';
      if (cause?.syncStatus === 'conflict' && cause.details?.remote && hasAttendance) {
        cause.details.remote = {
          ...cause.details.remote,
          attendanceStatus: Number(student.attendance_status),
        };
      }
      throw cause;
    }
    if (!result) return false;
    const hasAttendance = Object.hasOwn(student || {}, 'attendance_status')
      && student.attendance_status !== null
      && student.attendance_status !== '';
    if (!hasAttendance && shouldRequireNazemAttendance(mapped.date)) {
      throw reviewNazemError(
        'استجابة ناظم لا تحتوي حالة الحضور بعد حفظ التقييم.',
        'NAZEM_FOLLOW_UP_ATTENDANCE_MISSING',
      );
    }
    if (hasAttendance && Number(student.attendance_status) !== Number(mapped.attendanceStatus)) {
      throw conflictNazemError(
        'حالة الحضور المسجلة في ناظم تختلف عن المنصة.',
        'NAZEM_ATTENDANCE_CONFLICT',
        { remote: student.attendance_status, expected: mapped.attendanceStatus },
      );
    }
    return hasAttendance
      ? { ...result, attendanceStatus: Number(student.attendance_status) }
      : result;
  }

  async verifyResolvedRecitation(target, studentLink, mapped) {
    // Historical reads verify the saved amount only. Today's attendance was
    // read separately and must never be compared with the original day's status.
    const verification = target.executionDate
      ? { ...mapped, attendanceStatus: target.student?.attendance_status }
      : mapped;
    const result = await this.verifyRecitation(target.payload, studentLink, verification, target.day);
    if (!result || !target.executionDate) return result;
    if (Number(target.executionAttendanceStatus) !== Number(mapped.attendanceStatus)) {
      throw conflictNazemError('تغيّر حضور الطالب اليوم أثناء الإرسال. النتيجة تحتاج التحقق.', 'NAZEM_ATTENDANCE_CONFLICT');
    }
    return { ...result, attendanceStatus: Number(target.executionAttendanceStatus) };
  }

  verifyRecitationResult(day, mapped) {
    return verifyFinalFollowUp(day, mapped);
  }

  async postRecitationApi(path, payload) {
    await this.recitationJournal?.before(path);
    let response;
    try {
      response = await this.postFollowUpApi(path, payload);
    } catch (error) {
      if (error.confirmedRejection === true) await this.recitationJournal?.rejected(path, error.code);
      throw error;
    }
    await this.recitationJournal?.accepted(path);
    return response;
  }

  async verifyAfterRecitationWrite(mapped, verify) {
    try {
      const verified = await verify();
      if (verified) return verified;
    } catch (cause) {
      const error = reviewNazemError('أُرسل طلب التسميع ولم تثبت نتيجته بعد. يلزم التحقق من السجل الأصلي قبل إعادة الإرسال.', 'NAZEM_DELIVERY_UNVERIFIED', cause);
      error.details = { stage: 'post-write-verification', expectedRecordId: mapped.nazemSourceDayId, taskDate: mapped.date };
      throw error;
    }
    const error = reviewNazemError('أُرسل طلب التسميع ولم تظهر نتيجته بعد. النتيجة المحلية محفوظة وتنتظر التحقق.', 'NAZEM_DELIVERY_UNVERIFIED');
    error.details = { stage: 'post-write-verification', expectedRecordId: mapped.nazemSourceDayId, taskDate: mapped.date };
    throw error;
  }

  async verifySubmittedRecitation(studentLink, planLink, mapped) {
    return this.verifyAfterRecitationWrite(mapped, async () => {
      const target = await this.resolveRecitationFollowUp(studentLink, planLink, { ...mapped, allowPendingTargetReplacement: false }, { fresh: true });
      return this.verifyResolvedRecitation(target, studentLink, mapped);
    });
  }

  async submitLink(studentLink, planLink, mapped) {
    const target = await this.resolveRecitationFollowUp(studentLink, planLink, mapped);
    const { student, day } = target;
    if (!student || !day) throw blockedNazemError('لا يوجد سجل حفظ لهذا اليوم في ناظم.', 'NAZEM_NO_SCHEDULED_TASK');
    const count = Number(mapped.linkCount);
    if (!Number.isFinite(count) || count < 0 || count > 40) {
      throw reviewNazemError('عدد الربط المنفذ غير صالح.', 'NAZEM_INVALID_LINK_COUNT');
    }
    const result = () => ({ externalId: `link:${day.id}`, status: count > 0 ? 'completed' : 'not_completed', metrics: { link: count } });
    if (!FINAL_FOLLOW_UP_STATUSES.has(String(day.status || ''))) {
      throw blockedNazemError('حُفظ الربط محليًا وينتظر تسجيل الحفظ في ناظم لتحديث العدد دون تغيير حالة الحفظ.', 'NAZEM_LINK_WAITING_FOR_MEMORIZATION');
    }
    if (Object.hasOwn(day, 'link') && Number(day.link) === count) return { ...result(), alreadyRecorded: true };
    const attendanceStatus = Number(target.executionDate ? target.executionAttendanceStatus : student.attendance_status);
    if (![2, 5].includes(attendanceStatus)) {
      throw blockedNazemError('حضور الطالب اليوم لا يسمح بإرسال الربط.', 'NAZEM_ATTENDANCE_BLOCKS_RECITATION');
    }
    const completed = isNazemFollowUpCompleted(day.status);
    const preserved = ['status', 'actual_surah_to', 'actual_verse_to', 'mistake', 'hearing', 'repetition'];
    if (['mistake', 'hearing', 'repetition'].some((key) => !Object.hasOwn(day, key))
      || (completed && (!day.actual_surah_to || !day.actual_verse_to))) {
      throw reviewNazemError('تعذر قراءة بيانات الحفظ اللازمة لتحديث الربط وحده.', 'NAZEM_FOLLOW_UP_METRICS_MISSING');
    }
    await this.postRecitationApi(`/educational-plans/item-days/${day.id}${completed ? '/partial' : '/not-completed'}`, {
      ...(completed ? { actual_end_surah: Number(day.actual_surah_to), actual_end_aya: Number(day.actual_verse_to) } : {}),
      mistake: Number(day.mistake), hearing: Number(day.hearing), repetition: Number(day.repetition),
      attendance_status: attendanceStatus, link: count,
    });
    return this.verifyAfterRecitationWrite({ ...mapped, nazemSourceDayId: day.id }, async () => {
      const refreshed = await this.resolveRecitationFollowUp(studentLink, planLink, { ...mapped, nazemSourceDayId: day.id }, { fresh: true });
      const refreshedAttendance = refreshed.executionDate ? refreshed.executionAttendanceStatus : refreshed.student?.attendance_status;
      if (!refreshed.day || Number(refreshed.day.link) !== count
        || preserved.some((key) => String(refreshed.day[key] ?? '') !== String(day[key] ?? ''))
        || Number(refreshedAttendance) !== attendanceStatus) {
        return false;
      }
      return result();
    });
  }

  async submitRecitation(studentLink, planLink, mapped, { force = false } = {}) {
    if (mapped.taskType === 'link') return this.submitLink(studentLink, planLink, mapped);
    if (!['memorization', 'review'].includes(mapped.taskType)) {
      throw reviewNazemError('هذا النوع يندمج في تسميع الحفظ ولا يرسل كسجل مستقل إلى ناظم.', 'NAZEM_RECITATION_TYPE_ABSORBED');
    }
    if ([3, 4].includes(Number(mapped.attendanceStatus))) {
      throw blockedNazemError('لا يمكن إرسال تسميع لطالب حالته غائب أو مستأذن.', 'NAZEM_ATTENDANCE_BLOCKS_RECITATION');
    }
    try {
      const initial = await this.resolveRecitationFollowUp(studentLink, planLink, mapped);
      if (!initial.item) throw reviewNazemError('خطة الطالب في ناظم لا تحتوي نوع الورد المرتبط.', 'NAZEM_PLAN_TRACK_MISSING');
      const matchingLate = initial.late;
      if (matchingLate) {
        return await submitOldestLateRecitation(this, initial, studentLink, planLink, mapped);
      }

      if (!initial.day) {
        throw blockedNazemError('لا يوجد ورد مجدول في ناظم لهذا الطالب في تاريخ التسميع.', 'NAZEM_NO_SCHEDULED_TASK');
      }
      verifyScheduledStart(initial.day, mapped);
      let existing = null;
      try {
        existing = await this.verifyResolvedRecitation(initial, studentLink, mapped);
      } catch (error) {
        if (!force || error?.syncStatus !== 'conflict') throw error;
      }
      if (existing) return { ...existing, alreadyRecorded: true };
      if (!initial.pendingDay && (initial.item.is_blocked_by_late || initial.item.is_blocked_by_previous_days)) {
        throw blockedNazemError('يجب إنهاء الأيام السابقة أو المتأخرات في ناظم أولًا.', 'NAZEM_PREVIOUS_DAYS_BLOCKING');
      }
      const _resolveMetrics = () => {
        if (mapped.remoteType === 'conserve') {
          return {
          mistake: Number(mapped.remoteMistakeCount || 0),
          hearing: mapped.listeningCount > 0 ? 1 : 2,
          repetition: Number(mapped.repeatCount || 0),
          link: Number(mapped.linkCount ?? initial.day.link ?? 0),
        };
        }
        if (mapped.remoteType === 'revision') {
          return { mistake: Number(mapped.remoteMistakeCount || 0), tune: 0 };
        }
        return {};
      };
      const metrics = _resolveMetrics();
      const attendance = { attendance_status: Number(mapped.attendanceStatus) };
      const endpointSuffix = mapped.completed ? '/partial' : '/not-completed';
      const savePayload = mapped.completed
        ? {
          actual_end_surah: Number(mapped.toSurahId),
          actual_end_aya: Number(mapped.toAyah),
          ...metrics,
          ...attendance,
        }
        : { ...metrics, ...attendance };
      await this.postRecitationApi(
        `/educational-plans/item-days/${initial.day.id}${endpointSuffix}`,
        savePayload,
      );
      const verified = await this.verifySubmittedRecitation(studentLink, planLink, { ...mapped, nazemSourceDayId: initial.day.id });
      return verified;
    } catch (cause) {
      throwRecitationSubmissionError(cause);
    }
  }

  async getStudentPlans() {
    const groups = await this.listPlanGroups();
    const plans = [];
    for (const group of groups) {
      await this.page.goto(`${NAZEM_BASE_URL}${SELECTORS.educationalPlansPath}/${group.externalId}/edit`, { waitUntil: 'domcontentloaded' });
      await this.getPlanEditSaveButton();
      plans.push({
        externalId: group.externalId,
        text: cleanText(await this.page.locator('main').innerText()),
      });
    }
    return plans;
  }
}

export { SELECTORS as NAZEM_SELECTORS };

  function throwRecitationSubmissionError(cause) {
  if (cause?.name === 'NazemIntegrationError') throw cause;
  if (/timeout|navigation|net::/i.test(String(cause?.message || ''))) {
    throw transientNazemError('تعذر إكمال تسميع ناظم بسبب بطء أو انقطاع الاتصال.', 'NAZEM_RECITATION_TIMEOUT', cause);
  }
  const technicalReason = cleanText(cause?.message).slice(0, 180);
  throw reviewNazemError(
    technicalReason
      ? `تعذر إكمال إرسال التسميع بسبب تغير غير متوقع في استجابة ناظم: ${technicalReason}`
      : 'تغيرت بنية متابعة التسميع في ناظم وتحتاج المحولات إلى مراجعة.',
    'NAZEM_FORM_CHANGED',
    cause
  );
}

  function assertFollowUpResponse(response, payload) {
  if (!response.ok() || !payload?.status) {
    const remoteMessage = cleanText(payload?.message || payload?.error || '');
    const cause = new Error([
      `HTTP ${response.status()}`,
      remoteMessage,
      payload && typeof payload === 'object' ? `keys=${Object.keys(payload).slice(0, 8).join(',')}` : '',
    ].filter(Boolean).join(' '));
    throw transientNazemError(
      'تعذر تحميل متابعة الخطة من ناظم.',
      'NAZEM_FOLLOW_UP_LOAD_FAILED',
      cause
    );
  }
}

  async function collectNazemStudentIdentities(count, students, identities) {
    for (let index = 0;index < count;index += 1) {
      const student = students.nth(index);
      const name = student.locator('.epe-student__name').first();
      const studentName = await name.count() ? cleanText(await name.innerText()) : '';
      let externalId = null;
      for (const attribute of ['data-student-id', 'data-id', 'data-value', 'data-key']) {
        const value = cleanText(await student.getAttribute(attribute));
        if (isNazemExternalStudentId(value)) {
          externalId = value;
          break;
        }
      }
      externalId = await readFallbackStudentIdentity(externalId, student);
      identities.push({
        container: student,
        externalId,
        name: studentName,
        normalizedName: normalizeArabicPersonName(studentName),
      });
    }
  }

/** Read an authoritative student identifier from supported nested attributes or links. */
async function readFallbackStudentIdentity(externalId, student) {
  if (!externalId) {
    const identityElement = student.locator([
      '[data-student-id]',
      'input[name*="student_id"][value]',
      'input[name*="studentId"][value]',
      'input[name*="student"][value]',
      'a[href*="/students/"]',
    ].join(', ')).first();
    if (await identityElement.count()) {
      const directId = cleanText(await identityElement.getAttribute('data-student-id'))
        || cleanText(await identityElement.getAttribute('value'));
      const hrefId = /\/students\/(\d+)(?:\/|$)/.exec(cleanText(await identityElement.getAttribute('href')))?.[1];
      const candidateId = directId || hrefId;
      if (isNazemExternalStudentId(candidateId)) externalId = candidateId;
    }
  }
  return externalId;
}

/** Retry form loading once before filling credentials. */
async function waitForNazemLoginForm(adapter, usernameInput, passwordInput) {
let loginFormReady = false;
for (let loginPageAttempt = 0; loginPageAttempt < 2; loginPageAttempt += 1) {
        await adapter.page.goto(`${NAZEM_BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
        try {
          await Promise.all([
            usernameInput.waitFor({ state: 'visible', timeout: 7_000 }),
            passwordInput.waitFor({ state: 'visible', timeout: 7_000 }),
          ]);
          loginFormReady = true;
          break;
        } catch (error) {
          if (loginPageAttempt === 1) throw error;
        }
      }
return loginFormReady;
}

/** Read bounded API pages and deduplicate plans by external identity. */
async function collectPlanApiPages(adapter, payload, groups) {

for (let pageNumber = 0; pageNumber < 50; pageNumber += 1) {
          const page = extractNazemPlanApiPage(payload);
          page.groups.forEach((group) => groups.set(group.externalId, group));
          if (!page.nextPageUrl || page.currentPage >= page.lastPage) break;
          const nextUrl = new URL(page.nextPageUrl);
          payload = await adapter.getPlanApi(`${nextUrl.pathname}${nextUrl.search}`);
        }

}

/** Extract visible plan identities and counts from the supported table layouts. */
async function collectVisiblePlanGroups(firstDataRow, count, rows, pageGroups) {

for (let index = firstDataRow; index < count; index += 1) {
        const row = rows.nth(index);
        const text = cleanText(await row.innerText());
        if (!text || text.includes('لا توجد خطط') || text.includes('جاري التحميل')) continue;
        const editLink = row.locator('a[href*="/educational-plans/"]').first();
        const href = await editLink.count() ? await editLink.getAttribute('href') : '';
        const externalId = /\/educational-plans\/(\d+)(?:\/|$)/.exec(String(href || ''))?.[1]
          || /^(\d+)\b/.exec(text)?.[1]
          || null;
        if (externalId) {
          const cells = row.getByRole('cell');
          const studentCount = await cells.count() > 4
            ? Number(cleanText(await cells.nth(4).innerText()) || 0)
            : 0;
          pageGroups.push({ externalId, text, studentCount });
        }
      }

}

/** Distinguish an empty remote list from an incomplete load before accepting results. */
async function assertPlanListLoaded(adapter, groups, planApiError) {

if (!groups.size) {
      const pageText = cleanText(await adapter.page.locator('main').innerText().catch(() => ''));
      if (!/لا توجد خطط|لا توجد بيانات/.test(pageText)) {
        if (planApiError) throw planApiError;
        throw transientNazemError(
          'لم يكتمل تحميل قائمة خطط ناظم، وستعاد المحاولة تلقائيًا.',
          'NAZEM_PLAN_LIST_LOAD_INCOMPLETE',
        );
      }
    }

}

/** Discover each matched student plan while retaining per-student failures for review. */
async function discoverCandidatePlans({ adapter, candidates, planDetails, group, followUpHistory, discovered, issues }) {

for (const remoteStudent of candidates) {
        const studentLink = {
          nazemStudentId: remoteStudent.externalId,
          nazemStudentName: remoteStudent.name,
          externalOrganizationId: remoteStudent.organization?.id || null,
          externalOrganizationName: remoteStudent.organization?.name || null,
          externalCircleId: remoteStudent.circle?.id || null,
          externalCircleName: remoteStudent.circle?.name || null,
        };
        try {
          const apiBundle = planDetails ? mapNazemApiPlanBundle(planDetails, studentLink) : null;
          let conserve;
          conserve = await readConservePlan(apiBundle, conserve, adapter, group, studentLink);
          let master;
          master = await readMasteryPlan(apiBundle, master, adapter, group, studentLink);
          const primary = conserve || master;
          if (!primary) continue;
          const revision = apiBundle
            ? apiBundle.revision
            : await adapter.readPlan(group.externalId, studentLink, 'المراجعة', { navigate: false });
          const remoteType = primary.tab === 'الإتقان' ? 'master' : 'conserve';
          let latestFollowUp = null;
          latestFollowUp = findRecentPlanFollowUp(followUpHistory, studentLink, remoteType, latestFollowUp);
          const { student = null, day = null, date = null } = latestFollowUp || {};
          discovered.push({
            externalId: String(group.externalId),
            student: remoteStudent,
            primary,
            revision,
            startDate: primary.startDate || revision?.startDate || null,
            progress: (day || [2, 3, 4, 5].includes(Number(student?.attendance_status))) ? {
              date,
              status: day?.status || null,
              scheduledFromSurah: day?.surah_from || null,
              scheduledFromAyah: day?.verse_from || null,
              scheduledToSurah: day?.surah_to || null,
              scheduledToAyah: day?.verse_to || null,
              actualToSurah: day?.actual_surah_to || null,
              actualToAyah: day?.actual_verse_to || null,
              attendanceStatus: student?.attendance_status ?? null,
            } : null,
          });
        } catch (error) {
          issues.push({
            groupExternalId: String(group.externalId),
            studentExternalId: String(remoteStudent.externalId || ''),
            studentName: remoteStudent.name,
            errorCode: error?.code || 'NAZEM_PLAN_STUDENT_DISCOVERY_FAILED',
            message: String(error?.message || 'تعذرت قراءة خطة الطالب من ناظم.').slice(0, 500),
          });
        }
      }

}

/** Reuse API mastery data or read the supported plan form when unavailable. */
async function readMasteryPlan(apiBundle, master, adapter, group, studentLink) {
  if (apiBundle?.primary?.tab === 'الإتقان') {
    master = apiBundle.primary;
  } else if (!apiBundle) {
    master = await adapter.readPlan(group.externalId, studentLink, 'الإتقان', { navigate: false });
  } else {
    master = null;
  }
  return master;
}

/** Reuse API memorization data or read the supported plan form when unavailable. */
async function readConservePlan(apiBundle, conserve, adapter, group, studentLink) {
  if (apiBundle) {
    if (apiBundle.primary?.tab === 'الحفظ') {
      conserve = apiBundle.primary;
    } else {
      conserve = null;
    }
  } else {
    conserve = await adapter.readPlan(group.externalId, studentLink, 'الحفظ', { navigate: false });
  }
  return conserve;
}

/** Select the latest matching follow-up or attendance record from the ordered history. */
function findRecentPlanFollowUp(followUpHistory, studentLink, remoteType, latestFollowUp) {
  for (const entry of followUpHistory) {
    const match = findFollowUpDay(entry.payload, studentLink, remoteType);
    const hasAttendance = [2, 3, 4, 5].includes(Number(match.student?.attendance_status));
    if (match.day || hasAttendance) {
      latestFollowUp = { ...match, date: entry.date };
      break;
    }
  }
  return latestFollowUp;
}

/** Normalize each remote task type while retaining current pending and late records. */
async function collectRemoteFollowUpTypes({ adapter, payload, studentLink, confirmedRecordIds, daysAgo, endDate, externalPlanId, date, scheduled, rows }) {

for (const remoteType of ['conserve', 'revision', 'master']) {
        const { student, item, day } = findFollowUpDay(payload, studentLink, remoteType, { confirmedRecordIds });
        const pendingDay = item?.pending_day;
        collectCurrentPendingDay(daysAgo, pendingDay, remoteType, date, scheduled, item?.id);
        const lateItems = await loadCurrentLateItems({ daysAgo, endDate, adapter, item, externalPlanId, studentLink, remoteType });
        (daysAgo === 0 && (!endDate || endDate === saudiDate(0)) ? mapNazemPendingFollowUps({ ...item, late_items: lateItems }, {
          remoteType,
          attendanceStatus: student?.attendance_status ?? null,
        }) : []).forEach((late) => {
          late.nazemLateAvailableOn = date;
          const key = scheduledFollowUpKey(late);
          if (!scheduled.has(key)) scheduled.set(key, late);
        });
        if (!day) continue;
        const normalized = normalizeCurrentFollowUp(day, item, student, remoteType, date);
        if (FINAL_FOLLOW_UP_STATUSES.has(String(day.status || ''))) rows.push(normalized);
        else {
          const key = scheduledFollowUpKey(normalized);
          if (!scheduled.has(key)) scheduled.set(key, normalized);
        }
      }

}

/** Load late records only for the current requested day. */
async function loadCurrentLateItems({ daysAgo, endDate, adapter, item, externalPlanId, studentLink, remoteType }) {
  if (remoteType === 'revision') return [];
  return daysAgo === 0 && (!endDate || endDate === saudiDate(0)) ? await adapter.datedLateItems(item, externalPlanId, studentLink, remoteType) : [];
}

/** Preserve the current unfinished remote day as its own scheduled identity. */
function collectCurrentPendingDay(daysAgo, pendingDay, remoteType, date, scheduled, itemId) {
  if (remoteType === 'revision') return;
  if (daysAgo === 0 && pendingDay?.id && normalizeDateOnly(pendingDay.date)
    && !FINAL_FOLLOW_UP_STATUSES.has(String(pendingDay.status || ''))) {
    const pending = {
      ...pendingDay, ...(itemId ? { nazemItemId: String(itemId) } : {}), date: normalizeDateOnly(pendingDay.date), remoteType,
      taskType: remoteType === 'revision' ? 'review' : 'memorization',
      attendanceStatus: null, nazemLate: false, nazemPendingDay: true,
      nazemLateAvailableOn: date,
    };
    scheduled.set(scheduledFollowUpKey(pending), pending);
  }
}

/** Verify locked fields match and edit only the range inputs enabled by Nazem. */
async function updateUnlockedPlanRange(adapter, range, textboxes) {

for (let index = 0; index < range.length; index += 1) {
      const input = textboxes.nth(index);
      if (await input.isDisabled()) {
        const current = cleanText(await input.inputValue());
        if (current !== String(range[index])) {
          throw reviewNazemError('ناظم يسمح بعد بدء المتابعة بتعديل نهاية الخطة فقط.', 'NAZEM_PLAN_FIELD_LOCKED');
        }
      } else {
        await adapter.selectFromInput(input, range[index]);
      }
    }

}

/** Complete a matched late record and verify both attendance and completion before accepting success. */
async function submitLateRecitation({ adapter, matchingLate, mapped, planLink, studentLink, lateLookupDate }) {

if (matchingLate) {
        if (!mapped.completed) {
          return {
            externalId: String(matchingLate.id),
            status: 'not_completed',
            latePending: true,
            alreadyRecorded: true,
            metrics: {},
          };
        }
        await adapter.postRecitationApi(`/educational-plans/item-late/${matchingLate.id}/complete`);
        await adapter.postRecitationApi(`/educational-plans/${planLink.nazemPlanId}/attendance`, {
          student_id: Number(studentLink.nazemStudentId),
          attendance_status: Number(mapped.attendanceStatus),
          date: lateLookupDate,
        });
        const lateRefreshed = await adapter.openFollowUp(planLink.nazemPlanId, lateLookupDate, { fresh: true });
        const refreshed = findFollowUpDay(lateRefreshed, studentLink, mapped.remoteType);
        const refreshedStudent = refreshed.student;
        if (!refreshedStudent || Number(refreshedStudent.attendance_status) !== Number(mapped.attendanceStatus)) {
          throw reviewNazemError('اكتمل المتأخر في ناظم لكن تعذر التحقق من الحضور.', 'NAZEM_LATE_ATTENDANCE_UNVERIFIED');
        }
        const remainingLate = normalizeNazemFollowUpItems(refreshed.item?.late_items)
          .find((late) => String(late.id) === String(matchingLate.id));
        if (remainingLate && !isNazemFollowUpCompleted(remainingLate.status)) {
          throw reviewNazemError('تعذر التحقق من اكتمال التعويض في ناظم.', 'NAZEM_LATE_COMPLETION_UNVERIFIED');
        }
        return {
          externalId: String(matchingLate.id),
          status: 'completed_late',
          attendanceStatus: Number(refreshedStudent.attendance_status),
          lateCompleted: true,
          metrics: {},
        };
      }

}

/** Reuse the captured follow-up endpoint and retry authentication at most once. */
async function readCachedFollowUpPath({ adapter, directPath, cacheKey, retryAuthentication, externalPlanId, normalizedDate }) {

if (adapter.followUpApiBase && directPath) {
      try {
        const payload = await adapter.readFollowUpApi(directPath);
        adapter.followUpPayloadCache.set(cacheKey, payload);
        return payload;
      } catch (cause) {
        const status = String(cause?.cause?.message || '');
        if (!retryAuthentication || !/HTTP (401|419)/.test(status)) throw cause;
        adapter.resetFollowUpApiSession();
        await adapter.login({ forceFresh: true });
        return adapter.openFollowUp(externalPlanId, normalizedDate, { fresh: true, retryAuthentication: false });
      }
    }

}

/** Read the bounded seven-day history while advancing discovery progress. */
async function collectRecentFollowUpHistory(adapter, group, reportProgress, followUpHistory) {

  for (let daysAgo = 0; daysAgo < 7; daysAgo += 1) {
    const date = saudiDate(daysAgo);
    const payload = await adapter.openFollowUp(group.externalId, date).catch(() => null);
    if (payload) followUpHistory.push({ date, payload });
    await reportProgress();
  }

}

/** Cache the verified API path, response and required session headers for later follow-up requests. */
async function cacheFollowUpApiSession({ adapter, response, externalPlanId, normalizedDate, cacheKey, payload }) {
  const marker = `/educational-plans/${externalPlanId}/follow-up`;
  adapter.followUpApiBase = response.url().slice(0, response.url().indexOf(marker));
  const requestHeaders = await response.request().allHeaders();
  adapter.followUpApiHeaders = Object.fromEntries(
    ['authorization', 'x-company-id', 'x-tenant-id', 'x-xsrf-token', 'x-csrf-token', 'accept-language']
      .filter((name) => requestHeaders[name])
      .map((name) => [name, requestHeaders[name]]),
  );
  const apiCookies = await adapter.context.cookies('https://api.nazem-plus.com');
  const xsrfToken = apiCookies.find((cookie) => cookie.name === 'XSRF-TOKEN')?.value;
  if (xsrfToken && !adapter.followUpApiHeaders['x-xsrf-token']) {
    adapter.followUpApiHeaders['x-xsrf-token'] = decodeURIComponent(xsrfToken);
  }
  adapter.followUpApiHeaders.origin = NAZEM_BASE_URL;
  adapter.followUpApiHeaders.referer = `${NAZEM_BASE_URL}/`;
  const responseUrl = new URL(response.url());
  const followUpApiBasePath = new URL(adapter.followUpApiBase).pathname.replace(/\/$/, '');
  const absoluteResponsePath = `${responseUrl.pathname}${responseUrl.search}`;
  const responsePath = absoluteResponsePath.startsWith(`${followUpApiBasePath}/`)
    ? absoluteResponsePath.slice(followUpApiBasePath.length)
    : absoluteResponsePath;
  adapter.followUpApiPaths.set(cacheKey, responsePath);
  if (responsePath.includes(normalizedDate)) {
    adapter.followUpApiPathTemplate = responsePath
      .replace(`/educational-plans/${externalPlanId}/follow-up`, '/educational-plans/{planId}/follow-up')
      .replace(normalizedDate, '{date}');
  }
  adapter.followUpPayloadCache.set(cacheKey, payload);

}

async function submitOldestLateRecitation(adapter, initial, studentLink, planLink, mapped) {
  const lateLookupDate = initial.followUpDate;
  const lateItems = await adapter.datedLateItems(initial.item, planLink.nazemPlanId, studentLink, mapped.remoteType);
  const earliest = lateItems.filter(item => !isNazemFollowUpCompleted(item.status))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || Number(a.id) - Number(b.id))[0];
  if (String(earliest?.id) !== String(initial.late.id)) {
    throw blockedNazemError('ينتظر هذا المقطع تأكيد إكمال المتأخر الأقدم في ناظم.', 'NAZEM_PREVIOUS_DAYS_BLOCKING');
  }
  return await submitLateRecitation({ adapter, matchingLate: initial.late, mapped, planLink, studentLink, lateLookupDate });
}

function normalizeCurrentFollowUp(day, item, student, remoteType, date) {
  return {
    ...day,
    ...(item?.id ? { nazemItemId: String(item.id) } : {}),
    date: normalizeDateOnly(day.date) || date,
    remoteType,
    taskType: remoteType === 'revision' ? 'review' : 'memorization',
    attendanceStatus: student?.attendance_status ?? null,
    nazemLate: false,
  };
}
