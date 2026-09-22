import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { getBusinessDateDaysAgo } from '../shared/business-date.js';
import {
  calculateNameMatchConfidence,
  findUniqueArabicPersonNameMatch,
  isNazemFollowUpCompleted,
  isNazemExternalStudentId,
  normalizeArabicPersonName,
  resolveNazemPlanResumeDate,
} from '../shared/nazem-integration.js';
import {
  isValidNazemLinkCount,
  normalizeNazemLinkCount,
} from '../shared/nazem-link-count.js';
import { decryptNazemSecret, encryptNazemSecret } from '../server/integrations/nazem/crypto.js';
import { isAllowedNazemBrowserUrl } from '../server/integrations/nazem/browserSecurity.js';
import { loadDatabaseMigrations } from '../server/databaseMigrations.js';
import {
  applyNazemEntityFailure,
  describeNazemPlanDifference,
  requiresNazemIdentityReview,
  shouldApplyRemoteAttendance,
} from '../server/integrations/nazem/service.js';
import {
  deduplicateNazemStudents,
  mapNazemPendingFollowUps,
  normalizeNazemFollowUpItems,
  mergeNazemStudentSources,
  nazemFollowUpMetricsMatch,
  nazemPlanBundleMatches,
  nazemPlanItemMatches,
  normalizeNazemStudentProfile,
  resolveNazemPlanStudentIdentity,
  shouldRequireNazemAttendance,
} from '../server/integrations/nazem/adapter.js';
import { buildNazemLogEntries } from '../server/integrations/nazem/log.js';
import { canRetryNazemIssue } from '../src/lib/nazemSyncIssues.js';
import {
  NAZEM_ADAPTER_CIRCUIT_KEY,
  prepareNazemPlanReplacement,
  resolveNazemRecitationBarrier,
} from '../server/integrations/nazem/queue.js';
import { syncNazemScheduledTaskRange } from '../server/integrations/nazem/dailyTasks.js';
import { selectNazemFirstActionableTasks } from '../server/integrations/nazem/taskSelection.js';
import { buildNazemTenantScope } from '../server/integrations/nazem/tenantScope.js';
import {
  extractNazemPlanApiPage,
  mapNazemApiPlanBundle,
  resolveNazemApiPlanStudent,
} from '../server/integrations/nazem/planApi.js';
import {
  generateThreeDigitLoginNumber,
  normalizeThreeDigitLoginNumber,
} from '../server/services/loginNumbers.js';
import {
  mapRuwasiAttendanceStatusToNazem,
  mapRuwasiPlanBundleToNazem,
  mapRuwasiPlanToNazem,
  mapRuwasiRecitationGroupToNazem,
  mapRuwasiRecitationToNazem,
  mapNazemAmountToRuwasi,
  nazemRemoteErrorCount,
  toQuarterFaceUnits,
} from '../server/integrations/nazem/mapping.js';

process.env.NAZEM_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

test('Nazem attendance remains authoritative even when a local change is pending', () => {
  assert.equal(shouldApplyRemoteAttendance({
    localStatus: 'absent',
    localSubmittedStatus: 'absent',
    localJobStatus: 'pending',
    remoteStatus: 'present',
  }), true);
  assert.equal(shouldApplyRemoteAttendance({
    localStatus: 'absent',
    localSubmittedStatus: 'absent',
    localJobStatus: 'synced',
    remoteStatus: 'present',
  }), true);
  assert.equal(shouldApplyRemoteAttendance({
    localStatus: 'absent',
    localSubmittedStatus: 'absent',
    localJobStatus: 'pending',
    remoteStatus: 'absent',
  }), true);
});

test('pending Nazem follow-up never becomes a completed Rawasi recitation', () => {
  assert.equal(isNazemFollowUpCompleted('pending'), false);
  assert.equal(isNazemFollowUpCompleted('not_completed'), false);
  assert.equal(isNazemFollowUpCompleted('completed'), true);
  assert.equal(isNazemFollowUpCompleted('partial'), true);
  assert.equal(isNazemFollowUpCompleted('completed_late'), true);
});

test('Nazem diagnostics use one circuit key without stopping the sync worker', async () => {
  const routes = readFileSync(new URL('../server/routes/nazemIntegrationRoutes.js', import.meta.url), 'utf8');
  const queue = readFileSync(new URL('../server/integrations/nazem/queue.js', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../server/workers/nazemSyncWorker.js', import.meta.url), 'utf8');
  assert.equal(NAZEM_ADAPTER_CIRCUIT_KEY, 'nazem-api-v2');
  assert.match(routes, /WHERE adapter_key = \? LIMIT 1/);
  assert.match(routes, /\[NAZEM_ADAPTER_CIRCUIT_KEY\]/);
  assert.doesNotMatch(routes, /nazem-web-v1/);
  assert.doesNotMatch(worker, /assertNazemCircuitAvailable/);
  assert.match(queue, /state = 'closed', opened_at = NULL, retry_after = NULL/);
});

test('Nazem settings expose a complete sync log for accepted, active, and failed operations', () => {
  const routes = readFileSync(new URL('../server/routes/nazemIntegrationRoutes.js', import.meta.url), 'utf8');
  const settings = readFileSync(new URL('../src/components/dashboard/NazemIntegrationSettings.jsx', import.meta.url), 'utf8');
  const dialog = readFileSync(new URL('../src/components/dashboard/NazemLogDialog.jsx', import.meta.url), 'utf8');
  const api = readFileSync(new URL('../src/services/nazemIntegrationApi.js', import.meta.url), 'utf8');
  assert.match(routes, /router\.get\('\/log', requireSettings/);
  assert.match(routes, /FROM nazem_sync_events event/);
  assert.match(routes, /job\.status IN \('pending','syncing','retrying','blocked','failed','requires_review','conflict','synced'\)/);
  assert.match(routes, /job\.operation_type IN \('attendance\.submit','recitation\.submit'\)/);
  assert.match(routes, /'current' AS entryKind/);
  assert.match(routes, /'history' AS entryKind/);
  assert.match(routes, /buildNazemLogEntries\(activeRows, eventRows\)/);
  assert.match(routes, /LIMIT 500/);
  assert.match(settings, /سجل ناظم/);
  assert.match(settings, /<NazemLogDialog/);
  assert.match(dialog, /synced: \{ label: 'اكتملت المزامنة', className: 'text-emerald-700 bg-emerald-500\/10'/);
  assert.match(dialog, /blocked: \{ label: 'معلّق'/);
  assert.match(dialog, /entry\.message \|\| entry\.errorCode/);
  assert.match(dialog, /nazemIntegrationApi\.retryJob\(jobId\)/);
  assert.match(dialog, /entry\.entryKind === 'current'.*canRetryNazemIssue\(entry\)/);
  assert.match(dialog, /إعادة المحاولة/);
  assert.match(routes, /status IN \('failed','blocked','requires_review','conflict'\)/);
  assert.match(api, /getLog: \(\) => request\('\/nazem\/log'\)/);
});

test('Nazem log keeps current jobs and removes only their duplicate history event', () => {
  const current = [{ id: 'job-7', jobId: 7, status: 'conflict', attemptNumber: 2, entryKind: 'current' }];
  const duplicate = [{ id: 91, jobId: 7, status: 'conflict', attemptNumber: 2, entryKind: 'history' }];
  const earlier = [{ id: 90, jobId: 7, status: 'retrying', attemptNumber: 1, entryKind: 'history' }];
  assert.deepEqual(buildNazemLogEntries(current, [...duplicate, ...earlier]), [
    current[0],
    earlier[0],
  ]);
});

test('Nazem log distinguishes read-back success from a new delivery without treating false as true', () => {
  const rows = buildNazemLogEntries([
    { jobId: 1, status: 'synced', alreadyRecorded: 'true', authoritative: 'false' },
    { jobId: 2, status: 'synced', alreadyRecorded: false, authoritative: 'true' },
    { jobId: 3, status: 'synced', alreadyRecorded: 'false', authoritative: null },
  ]);
  assert.equal(rows[0].alreadyRecorded, true);
  assert.equal(rows[0].authoritative, false);
  assert.equal(rows[1].alreadyRecorded, false);
  assert.equal(rows[1].authoritative, true);
  assert.equal(rows[2].alreadyRecorded, false);
});

test('Nazem does not offer retries for conflicts or issues that require data correction', () => {
  assert.equal(canRetryNazemIssue({ status: 'conflict' }), false);
  assert.equal(canRetryNazemIssue({
    status: 'requires_review',
    errorCode: 'NAZEM_REVISION_RANGE_DISCONNECTED',
  }), false);
  assert.equal(canRetryNazemIssue({ status: 'requires_review', errorCode: 'NAZEM_FORM_CHANGED' }), true);
});

test('all Rawasi student attendance statuses map to Nazem', () => {
  assert.equal(mapRuwasiAttendanceStatusToNazem('present'), 2);
  assert.equal(mapRuwasiAttendanceStatusToNazem('absent'), 3);
  assert.equal(mapRuwasiAttendanceStatusToNazem('excused'), 4);
  assert.equal(mapRuwasiAttendanceStatusToNazem('late'), 5);
  assert.equal(mapRuwasiAttendanceStatusToNazem('unknown'), null);
});

test('Nazem plan API maps every student by stable external id', () => {
  const students = Array.from({ length: 15 }, (_, index) => ({
    student_id: 10_000 + index,
    student_name: `طالب ${index + 1}`,
    items: [{
      type: 'conserve',
      surah_from_name: 'القارعة',
      verse_from: 1,
      surah_to_name: 'النبأ',
      verse_to: 30,
      repetition: 10,
      link: 5,
      daily_amount: 0.25,
      start_date: '2026-08-27',
      direction: 'reverse',
    }, {
      type: 'revision',
      surah_from_name: 'التكوير',
      verse_from: 1,
      surah_to_name: 'الناس',
      verse_to: 6,
      repetition: null,
      link: null,
      daily_amount: 1,
      start_date: '2026-08-27',
      direction: 'forward',
    }],
  }));
  const details = { id: 279, students };
  const bundles = students.map((student) => mapNazemApiPlanBundle(details, {
    nazemStudentId: String(student.student_id),
    nazemStudentName: student.student_name,
  }));

  assert.equal(bundles.length, 15);
  assert.equal(bundles.every(Boolean), true);
  assert.equal(bundles[0].primary.amount, 'ربع وجه');
  assert.equal(bundles[0].primary.direction, 'تصاعدي');
  assert.equal(bundles[0].revision.tab, 'المراجعة');
  assert.equal(resolveNazemApiPlanStudent(details, {
    nazemStudentId: '10014',
    nazemStudentName: 'اسم مختلف لا يعتمد عليه',
  }).student_name, 'طالب 15');
});

test('Nazem plan API pagination preserves all groups', () => {
  assert.deepEqual(extractNazemPlanApiPage({
    data: {
      current_page: 1,
      last_page: 2,
      next_page_url: 'https://api.nazem-plus.com/api/educational-plans?page=2',
      data: [{
        id: 279,
        company: 'مجمع الحبيب',
        class_name: 'انيس الانصاري',
        term: 'الفصل الأول',
        status: 'active',
        students_count: 15,
      }],
    },
  }), {
    currentPage: 1,
    lastPage: 2,
    nextPageUrl: 'https://api.nazem-plus.com/api/educational-plans?page=2',
    groups: [{
      externalId: '279',
      organizationName: 'مجمع الحبيب',
      circleName: 'انيس الانصاري',
      text: 'مجمع الحبيب انيس الانصاري الفصل الأول active',
      studentCount: 15,
    }],
  });
});

test('student attendance endpoints enqueue their saved status for Nazem delivery', () => {
  const serverSource = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  const queueSource = readFileSync(new URL('../server/integrations/nazem/queue.js', import.meta.url), 'utf8');
  const serviceSource = readFileSync(new URL('../server/integrations/nazem/service.js', import.meta.url), 'utf8');
  const adapterSource = readFileSync(new URL('../server/integrations/nazem/adapter.js', import.meta.url), 'utf8');
  const routesSource = readFileSync(new URL('../server/routes/nazemIntegrationRoutes.js', import.meta.url), 'utf8');
  const attendanceRoute = serverSource.match(
    /app\.post\('\/api\/students\/:id\/attendance'[\s\S]+?app\.post\('\/api\/students\/:id\/absence'/,
  )?.[0] || '';
  const absenceRoute = serverSource.match(
    /app\.post\('\/api\/students\/:id\/absence'[\s\S]+?app\.post\('/,
  )?.[0] || '';

  assert.match(attendanceRoute, /enqueueNazemAttendance\([\s\S]+?status,/);
  assert.match(absenceRoute, /enqueueNazemAttendance\([\s\S]+?status: 'absent'/);
  assert.match(queueSource, /operationType: 'attendance\.submit'/);
  assert.match(queueSource, /nazemPlanId/);
  assert.match(queueSource, /nazem_plan_candidates/);
  assert.match(queueSource, /RUWASI_ATTENDANCE_REPLACED/);
  assert.match(queueSource, /enqueueMissingNazemAttendance/);
  assert.match(queueSource, /attendance\.record_date >= \?/);
  assert.match(queueSource, /shiftDateOnly\(getBusinessDate\(\), -14\)/);
  assert.match(queueSource, /job\.status <> 'dismissed'/);
  assert.match(queueSource, /operation_type = 'attendance\.submit' THEN 2/);
  assert.match(routesSource, /for \(const studentId of new Set\(studentByExternalId\.values\(\)\)\)[\s\S]*enqueueMissingNazemAttendance/);
  assert.match(serviceSource, /case 'attendance\.submit':[\s\S]+?syncAttendance\(connection, job\)/);
  assert.match(serviceSource, /ORDER BY \(sync_status = 'synced'\) DESC/);
  assert.match(serviceSource, /const remote = await adapter\.submitAttendance\(studentLink, targetPlan, \{ date, attendanceStatus, explicitChange: job\.payload\?\.explicitChange === true \}\)/);
  assert.match(serviceSource, /applyRemoteAttendanceToRuwasi/);
  assert.match(serviceSource, /operation_type = 'attendance\.submit'[\s\S]*status IN \('pending','retrying','syncing','failed','blocked','requires_review','conflict'\)/);
  assert.match(serviceSource, /last_error_code = 'NAZEM_REMOTE_AUTHORITATIVE'/);
  assert.doesNotMatch(serviceSource, /const \[\[activeLocalJob\]\][\s\S]*if \(activeLocalJob\) return false/);
  assert.match(serviceSource, /NAZEM_ATTENDANCE_TO_RUWASI/);
  assert.match(readFileSync(new URL('../server/integrations/nazem/followUpImport.js', import.meta.url), 'utf8'), /history\.attendance/);
  assert.match(serviceSource, /remotePlan\.progress\?\.attendanceStatus/);
  assert.match(serviceSource, /targetPlan/);
  assert.match(adapterSource, /match\.day \|\| hasAttendance/);
  assert.match(adapterSource, /async login\(\{ requireIdentity = false, forceFresh = false \} = \{\}\)/);
  assert.match(adapterSource, /if \(requireIdentity\) \{[\s\S]+NAZEM_TEACHER_CONTEXT_MISSING/);
  assert.doesNotMatch(adapterSource, /getByText\('متابعة الخطة'.+waitFor/);
  assert.match(adapterSource, /candidate\.url\(\)\.startsWith\('https:\/\/api\.nazem-plus\.com\/'\)/);
  assert.match(adapterSource, /response\.request\(\)\.allHeaders\(\)/);
  assert.match(adapterSource, /maxRedirects: 0/);
});

test('Nazem import restores completed memorization and wakes waiting attendance', () => {
  const serverSource = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  const routesSource = readFileSync(new URL('../server/routes/nazemIntegrationRoutes.js', import.meta.url), 'utf8');
  const dialogSource = readFileSync(new URL('../src/components/dashboard/NazemStudentPlanImportDialog.jsx', import.meta.url), 'utf8');

  assert.match(serverSource, /const importedPriorMemorization = \[\]/);
  assert.match(serverSource, /mergeQuranRanges\(connection, importedPriorMemorization\)/);
  assert.match(serverSource, /operation_type = 'attendance\.submit'[\s\S]+status IN \('pending','failed','blocked','requires_review','retrying'\)/);
  assert.match(serverSource, /enqueueMissingNazemAttendance\(connection/);
  assert.match(routesSource, /planCandidateId: Number\(selection\.planCandidateId/);
  assert.match(routesSource, /\(\? IS NULL OR id = \?\) FOR UPDATE/);
  assert.match(dialogSource, /isActionableCandidate/);
  assert.match(dialogSource, /useEffect\(\(\) => \{[\s\S]+if \(open && !prepared\?\.preview\) void load\(\{ refresh: true \}\)/);
  assert.match(dialogSource, /requiresPlanChoice/);
  assert.match(dialogSource, /كل الطلاب والخطط المستوردة مرتبطة مسبقًا/);
});

test('Nazem remains authoritative when either linked plan snapshot changes', () => {
  const serviceSource = readFileSync(new URL('../server/integrations/nazem/service.js', import.meta.url), 'utf8');
  assert.match(serviceSource, /if \(remoteChanged \|\| localChanged\)[\s\S]+applyRemotePlanToRuwasi/);
  assert.match(serviceSource, /applyRemotePlanToRuwasi[\s\S]+readStudentFollowUpHistory/);
  assert.match(readFileSync(new URL('../server/integrations/nazem/followUpImport.js', import.meta.url), 'utf8'), /history\.followUps[\s\S]+localeCompare[\s\S]+syncScheduled[\s\S]+saveFollowUp/);
  assert.match(serviceSource, /NAZEM_REMOTE_AUTHORITATIVE/);
  assert.match(serviceSource, /UPDATE student_quran_recitation_attempts SET is_official = 0/);
  assert.match(serviceSource, /advanceNazemMemorizationCursor/);
  assert.match(serviceSource, /next_memorization_page = \?/);
  assert.match(serviceSource, /nazem_applied_automatically/);
  assert.doesNotMatch(serviceSource, /NAZEM_REMOTE_DAILY_CHANGED/);
  assert.doesNotMatch(serviceSource, /if \(localChanged && !remoteChanged\)[\s\S]+operationType: 'plan\.upsert'/);
  assert.doesNotMatch(serviceSource, /remotePlanAutoApplyBlocker|NAZEM_REMOTE_CHANGED/);
});

test('Nazem credentials are encrypted with authenticated reversible encryption', () => {
  const encrypted = encryptNazemSecret('sensitive-value');
  assert.equal(encrypted.startsWith('v2.'), true);
  assert.equal(encrypted.includes('sensitive-value'), false);
  assert.equal(decryptNazemSecret(encrypted), 'sensitive-value');
  const parts = encrypted.split('.');
  parts[3] = `${parts[3][0] === 'A' ? 'B' : 'A'}${parts[3].slice(1)}`;
  assert.throws(() => decryptNazemSecret(parts.join('.')));
});

test('Arabic teacher and student names normalize consistently for safe suggestions', () => {
  assert.equal(normalizeArabicPersonName('أحمد  بن علي'), 'احمد بن علي');
  assert.equal(calculateNameMatchConfidence('أحمد بن علي', 'احمد بن علي'), 1);
  assert.equal(calculateNameMatchConfidence('أحمد علي', 'محمد خالد') < 0.5, true);
  assert.equal(calculateNameMatchConfidence('محمد أحمد', 'أحمد محمد') < 0.67, true);
  assert.equal(calculateNameMatchConfidence('محمد أحمد', 'محمد أحمد علي') >= 0.8, true);
  assert.equal(calculateNameMatchConfidence('جواد التويجري', 'جواد بن محمد التويجري') >= 0.9, true);
  assert.equal(findUniqueArabicPersonNameMatch([
    { id: 1, name: 'جواد بن محمد التويجري' },
    { id: 2, name: 'محمد جواد التويجري' },
  ], 'جواد التويجري')?.candidate.id, 1);
  assert.equal(findUniqueArabicPersonNameMatch([
    { id: 1, name: 'جواد بن محمد التويجري' },
    { id: 2, name: 'جواد بن علي التويجري' },
  ], 'جواد التويجري'), null);
  assert.equal(isNazemExternalStudentId('student-1289'), true);
  assert.equal(isNazemExternalStudentId('name:محمد'), false);
  assert.equal(isNazemExternalStudentId('محمد'), false);
});

test('Nazem account identity requires explicit approval only for a mismatched teacher', () => {
  assert.equal(requiresNazemIdentityReview({
    localTeacherName: 'فهد الباحوث',
    externalTeacherName: 'عزام بن عبدالعزيز الزميع',
  }), true);
  assert.equal(requiresNazemIdentityReview({
    localTeacherName: 'فهد الباحوث',
    externalTeacherName: 'فهد الباحوث',
  }), false);
  assert.equal(requiresNazemIdentityReview({
    localTeacherName: 'فهد الباحوث',
    externalTeacherName: 'عزام بن عبدالعزيز الزميع',
    identityWasConfirmed: true,
  }), false);
});

test('Nazem bulk student import uses unique three-digit login numbers', () => {
  assert.equal(normalizeThreeDigitLoginNumber(' ١٢٣ '), '');
  assert.equal(normalizeThreeDigitLoginNumber('123'), '123');
  const used = new Set(Array.from({ length: 899 }, (_, index) => String(index + 100)));
  const generated = generateThreeDigitLoginNumber(used);
  assert.equal(generated, '999');
  assert.equal(used.has('999'), true);
});

test('Nazem student discovery removes duplicate visible-option records', () => {
  const context = {
    organization: { id: 'organization-1', name: 'مجمع الحبيب' },
    circle: { id: 'circle-1', name: 'طلحة بن زيد الانصاري' },
  };
  assert.deepEqual(deduplicateNazemStudents([
    { ...context, externalId: 'student-15', name: 'فيصل جبريل' },
    { ...context, externalId: 'student-15', name: 'فيصل جبريل' },
    { ...context, externalId: null, name: 'محمد مرشد الرشيدي' },
    { ...context, externalId: null, name: 'محمد مرشد الرشيدي' },
  ]).map((student) => student.name), ['فيصل جبريل', 'محمد مرشد الرشيدي']);
});

test('Nazem student discovery includes every profile in the selected circle', () => {
  const organization = { id: 'organization-1', name: 'مجمع الحبيب' };
  const circle = { id: 'circle-1', name: 'أنيس الأنصاري' };
  const visible = [{ externalId: '101', name: 'الطالب الأول', organization, circle }];
  const profiles = [
    { id: '101', name: 'الطالب الأول', organizationName: organization.name, circleName: circle.name },
    { id: '102', name: 'الطالب الثاني', organizationName: organization.name, circleName: circle.name },
    { id: '103', name: 'الطالب الثالث', organizationName: organization.name, circleName: circle.name },
    { id: '104', name: 'الطالب الرابع', organizationName: organization.name, circleName: circle.name },
  ];

  const merged = mergeNazemStudentSources(visible, profiles, [{ organization, circle }]);

  assert.deepEqual(merged.map((student) => student.externalId), ['101', '102', '103', '104']);
  assert.equal(merged.every((student) => student.profile), true);
});

test('Nazem plan students match by external id before the unique-name fallback', () => {
  const identities = [
    { externalId: '101', normalizedName: normalizeArabicPersonName('إبراهيم علي الشيخ') },
    { externalId: '202', normalizedName: normalizeArabicPersonName('إبراهيم علي الشيخ') },
  ];
  assert.equal(resolveNazemPlanStudentIdentity(identities, {
    nazemStudentId: '202',
    nazemStudentName: 'إبراهيم علي الشيخ',
  }).externalId, '202');
  assert.throws(() => resolveNazemPlanStudentIdentity(identities, {
    nazemStudentId: '303',
    nazemStudentName: 'إبراهيم علي الشيخ',
  }), (error) => error.code === 'NAZEM_PLAN_STUDENT_MISMATCH');
  assert.equal(resolveNazemPlanStudentIdentity([
    ...identities,
    { externalId: null, normalizedName: normalizeArabicPersonName('طالب بلا معرف') },
  ], {
    nazemStudentId: '303',
    nazemStudentName: 'طالب بلا معرف',
  }).externalId, null);
  assert.equal(resolveNazemPlanStudentIdentity([
    { externalId: null, normalizedName: normalizeArabicPersonName('إبراهيم علي الشيخ') },
  ], {
    nazemStudentId: '303',
    nazemStudentName: 'إبراهيم علي الشيخ',
  }).normalizedName, normalizeArabicPersonName('إبراهيم علي الشيخ'));
});

test('Nazem plan import keeps today when the latest progress was on a previous day', () => {
  const scheduleDays = [0, 1, 2, 3, 4];
  assert.equal(resolveNazemPlanResumeDate({
    todayDate: '2026-08-27',
    scheduleDays,
    progressDate: '2026-08-26',
    completedToday: true,
  }), '2026-08-27');
  assert.equal(resolveNazemPlanResumeDate({
    todayDate: '2026-08-27',
    scheduleDays,
    progressDate: '2026-08-27',
    completedToday: true,
  }), '2026-08-30');
});

test('Nazem student profiles retain the full supported import data', () => {
  assert.deepEqual(normalizeNazemStudentProfile({
    id: 1395,
    name: 'عبدالعزيز البراك',
    national_id: '1148879925',
    phone: '0500000000',
    username: 'student-1395',
    email: 'student@example.com',
    edu_level_name: 'أول ثانوي',
    company_name: 'مجمع الحبيب',
    class_name: 'طلحة بن زيد الأنصاري',
    joined_date: '2026-08-25',
    status: 1,
    status_name: 'مستمر',
  }), {
    id: '1395',
    name: 'عبدالعزيز البراك',
    nationalId: '1148879925',
    phone: '0500000000',
    username: 'student-1395',
    email: 'student@example.com',
    educationLevel: 'أول ثانوي',
    organizationName: 'مجمع الحبيب',
    circleName: 'طلحة بن زيد الأنصاري',
    joinedDate: '2026-08-25',
    status: '1',
    statusName: 'مستمر',
  });
});

test('Nazem plan verification requires the complete expected remote plan', () => {
  const expected = {
    tab: 'الحفظ',
    amount: 'وجه كامل',
    direction: 'تنازلي',
    startSurah: 'الفاتحة',
    startAyah: 1,
    endSurah: 'البقرة',
    endAyah: 5,
    repeatCount: 10,
    linkCount: 5,
  };
  assert.equal(nazemPlanItemMatches({ ...expected }, expected), true);
  assert.equal(nazemPlanItemMatches({ ...expected, endAyah: 6 }, expected), false);
  assert.equal(nazemPlanBundleMatches({ primary: expected, revision: null }, {
    primary: expected,
    revision: null,
  }), true);
});

test('Nazem browser allowlist blocks third-party and internal network requests', () => {
  assert.equal(isAllowedNazemBrowserUrl('https://nazem-plus.com/login'), true);
  assert.equal(isAllowedNazemBrowserUrl('https://api.nazem-plus.com/educational-plans'), true);
  assert.equal(isAllowedNazemBrowserUrl('http://127.0.0.1/admin'), false);
  assert.equal(isAllowedNazemBrowserUrl('https://example.com/'), false);
});

test('Ruwasi plans map only to values verified in the Nazem form', () => {
  assert.equal(toQuarterFaceUnits(0.25), 1);
  assert.equal(toQuarterFaceUnits(0.5), 2);
  assert.equal(toQuarterFaceUnits(1), 4);
  assert.equal(toQuarterFaceUnits(0.3), null);
  assert.equal(mapNazemAmountToRuwasi('ربع وجه'), 0.25);
  assert.equal(mapNazemAmountToRuwasi('\u200b ربع وجه'), 0.25);
  assert.equal(mapNazemAmountToRuwasi('وجه ونصف'), 1.5);
  assert.equal(mapRuwasiPlanToNazem({
    track: 'memorization',
    dailyPages: 0.25,
    startPage: 1,
    endPage: 2,
    startSurahName: 'الفاتحة',
    startAyah: 1,
    endSurahName: 'البقرة',
    endAyah: 5,
  }).amount, 'ربع وجه');
  assert.deepEqual(mapRuwasiPlanToNazem({
    track: 'memorization',
    dailyPages: 0.5,
    startPage: 1,
    endPage: 2,
    startSurahName: 'الفاتحة',
    startAyah: 1,
    endSurahName: 'البقرة',
    endAyah: 5,
    repeatCount: 10,
    linkPages: 5,
  }), {
    tab: 'الحفظ',
    amount: 'نصف وجه',
    direction: 'تنازلي',
    startSurah: 'الفاتحة',
    startAyah: 1,
    endSurah: 'البقرة',
    endAyah: 5,
    repeatCount: 10,
    linkCount: 5,
  });
  assert.throws(
    () => mapRuwasiPlanToNazem({ track: 'memorization', dailyPages: 3 }),
    (error) => error.code === 'NAZEM_AMOUNT_UNAVAILABLE' && error.syncStatus === 'blocked',
  );
});

test('Nazem plan bundle follows the Ruwasi track and adds prior memorization as revision', () => {
  const bundle = mapRuwasiPlanBundleToNazem({
    track: 'mastery',
    dailyPages: 1,
    startPage: 10,
    endPage: 20,
    startDate: '2026-08-24',
    startSurahName: 'البقرة',
    startAyah: 62,
    endSurahName: 'البقرة',
    endAyah: 134,
    repeatCount: 30,
    linkPages: 10,
  }, {
    startSurahName: 'الفاتحة',
    startAyah: 1,
    endSurahName: 'البقرة',
    endAyah: 61,
  });
  assert.equal(bundle.primary.tab, 'الإتقان');
  assert.equal(bundle.primary.repeatCount, 30);
  assert.equal(bundle.primary.linkCount, 10);
  assert.deepEqual(bundle.revision, {
    tab: 'المراجعة',
    amount: null,
    direction: null,
    startSurah: 'الفاتحة',
    startAyah: 1,
    endSurah: 'البقرة',
    endAyah: 61,
    repeatCount: null,
    linkCount: null,
  });
  assert.equal(bundle.startDate, '2026-08-24');
});

test('Nazem plan conflicts report the exact changed fields and values', () => {
  const difference = describeNazemPlanDifference({
    primary: {
      tab: 'الحفظ', amount: 'ربع وجه', startSurah: 'البقرة', startAyah: 1, endSurah: 'البقرة', endAyah: 100,
    },
  }, {
    primary: {
      tab: 'الحفظ', amount: 'نصف وجه', startSurah: 'البقرة', startAyah: 1, endSurah: 'آل عمران', endAyah: 20,
    },
  });
  assert.match(difference, /الحفظ — المقدار: ربع وجه ← نصف وجه/);
  assert.match(difference, /الحفظ — سورة النهاية: البقرة ← آل عمران/);
  assert.match(difference, /الحفظ — آية النهاية: 100 ← 20/);
});

test('Ruwasi recitation maps to the verified Nazem follow-up fields', () => {
  assert.deepEqual(mapRuwasiRecitationToNazem({
    taskType: 'memorization',
    track: 'memorization',
    taskDate: '2026-08-24',
    warningCount: 2,
    mistakeCount: 1,
    evaluationScore: 92,
    teacherCompleted: 1,
    attendanceStatus: 'late',
    actualRepeatCount: 7,
    actualListeningCount: 3,
    linkCount: 2,
    fromSurahName: 'البقرة',
    fromSurah: 2,
    fromAyah: 1,
    toSurahName: 'البقرة',
    toSurah: 2,
    toAyah: 6,
  }), {
    taskType: 'memorization',
    remoteType: 'conserve',
    remoteTab: 'حفظ',
    warningCount: 2,
    mistakeCount: 1,
    remoteMistakeCount: 1,
    remoteTuneCount: 0,
    score: 92,
    completed: true,
    date: '2026-08-24',
    sessionDate: '2026-08-24',
    attendanceStatus: 5,
    repeatCount: 7,
    listeningCount: 3,
    linkCount: 2,
    fromSurah: 'البقرة',
    fromSurahId: 2,
    fromAyah: 1,
    scheduledToSurahId: 2,
    scheduledToAyah: 6,
    toSurah: 'البقرة',
    toAyah: 6,
    toSurahId: 2,
  });
  const review = mapRuwasiRecitationToNazem({
    taskType: 'review',
    warningCount: 3,
    mistakeCount: 2,
    teacherCompleted: 0,
  });
  assert.equal(review.remoteType, 'revision');
  assert.equal(review.remoteTuneCount, 0);
  assert.equal(review.completed, false);
  const mastery = mapRuwasiRecitationToNazem({
    taskType: 'memorization',
    track: 'mastery',
    teacherCompleted: 1,
  });
  assert.equal(mastery.remoteType, 'master');
  assert.equal(mastery.remoteTab, 'إتقان');
  assert.equal(mastery.completed, true);
  const compensation = mapRuwasiRecitationToNazem({
    taskType: 'memorization',
    taskDate: '2026-08-23',
    sessionDate: '2026-08-24',
  });
  assert.equal(compensation.date, '2026-08-23');
  assert.equal(compensation.sessionDate, '2026-08-24');
  const mysqlDate = mapRuwasiRecitationToNazem({
    taskType: 'memorization',
    sessionDate: new Date('2026-09-03T00:00:00.000Z'),
  });
  assert.equal(mysqlDate.date, '2026-09-03');
});

test('Nazem only requires attendance in the current-day follow-up response', () => {
  assert.equal(shouldRequireNazemAttendance(getBusinessDateDaysAgo(1)), false);
  assert.equal(shouldRequireNazemAttendance(getBusinessDateDaysAgo(0)), true);
});

test('Nazem receives one daily result for multi-face Rawasi recitation and keeps warnings local', () => {
  const base = {
    taskType: 'memorization',
    track: 'memorization',
    taskDate: '2026-08-25',
    attendanceStatus: 'present',
    planStartPage: 2,
    planEndPage: 20,
    fromSurahName: 'البقرة',
    toSurahName: 'البقرة',
    actualToSurahName: 'البقرة',
    plannedRepeatCount: 4,
    plannedListeningCount: 3,
  };
  const mapped = mapRuwasiRecitationGroupToNazem([
    {
      ...base, id: 11, taskId: 101, fromPage: 2, toPage: 2,
      linkCount: 4,
      fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 5,
      actualToPage: 2, actualToSurah: 2, actualToAyah: 5,
      warningCount: 3, mistakeCount: 1, teacherCompleted: 1, evaluationScore: 96,
    },
    {
      ...base, id: 12, taskId: 102, fromPage: 3, toPage: 3,
      fromSurah: 2, fromAyah: 6, toSurah: 2, toAyah: 16,
      scheduledToSurah: 2, scheduledToAyah: 16,
      actualToPage: 4, actualToSurah: 2, actualToAyah: 30,
      warningCount: 2, mistakeCount: 2, teacherCompleted: 1, evaluationScore: 80,
    },
    {
      ...base, id: 13, taskId: 103, fromPage: 4, toPage: 4,
      fromSurah: 2, fromAyah: 17, toSurah: 2, toAyah: 30,
      actualToPage: 4, actualToSurah: 2, actualToAyah: 30,
      warningCount: 0, mistakeCount: 0, teacherCompleted: 1, evaluationScore: 100,
    },
  ]);
  assert.equal(mapped.partCount, 3);
  assert.deepEqual(mapped.taskIds, [101, 102, 103]);
  assert.equal(mapped.warningCount, 5);
  assert.equal(mapped.remoteMistakeCount, 3);
  assert.equal(mapped.remoteTuneCount, 0);
  assert.equal(mapped.completed, true);
  assert.equal(mapped.linkCount, 4);
  assert.equal(mapped.fromAyah, 1);
  assert.equal(mapped.scheduledToAyah, 16);
  assert.equal(mapped.toAyah, 30);
  assert.equal(nazemRemoteErrorCount({ mistake: 2, tune: 3 }), 5);

  const reverse = mapRuwasiRecitationGroupToNazem([
    {
      ...base, id: 21, taskId: 201, planStartPage: 604, planEndPage: 1,
      fromPage: 603, toPage: 603, fromSurah: 2, fromAyah: 6, toSurah: 2, toAyah: 10,
      actualToPage: 603, actualToSurah: 2, actualToAyah: 10,
      warningCount: 0, mistakeCount: 0, teacherCompleted: 1, evaluationScore: 100,
    },
    {
      ...base, id: 22, taskId: 202, planStartPage: 604, planEndPage: 1,
      fromPage: 604, toPage: 604, fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 5,
      actualToPage: 604, actualToSurah: 2, actualToAyah: 5,
      warningCount: 0, mistakeCount: 0, teacherCompleted: 1, evaluationScore: 100,
    },
  ]);
  assert.deepEqual(reverse.taskIds, [202, 201]);
  assert.equal(reverse.fromAyah, 1);
  assert.equal(reverse.scheduledToAyah, 10);
});

test('Nazem scheduled ayah boundary replaces expired untouched Rawasi tasks exactly', async () => {
  const writes = [];
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    async query(sql, params = []) {
      if (sql.includes('FROM student_quran_plans')) return [[{ id: 7, studentId: 9, track: 'memorization' }]];
      if (sql.includes('FROM quran_ayah_pages')) {
        return [[{ page: Number(params[1]) <= 5 ? 2 : 3 }]];
      }
      if (sql.includes('FROM student_quran_tasks t')) {
        const type = params[3];
        return [[type === 'memorization' ? {
          id: 31, fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 20,
          studentStatus: 'not_done', teacherCompleted: null, evaluatedAt: null,
          executionActorRole: null, hasAttempt: 0, hasAyahMarks: 0, hasWordMarks: 0,
        } : []].flat()];
      }
      writes.push({ sql, params });
      return [{ affectedRows: 1, insertId: 44 }];
    },
  };
  const result = await syncNazemScheduledTaskRange(connection, { planId: 7, studentId: 9 }, {
    taskType: 'memorization', date: '2026-08-26',
    surah_from: 2, verse_from: 1, surah_to: 2, verse_to: 10,
  });
  assert.deepEqual(result, { matched: true, changed: true });
  const inserts = writes.filter(({ sql }) => sql.includes('INSERT INTO student_quran_tasks'));
  assert.equal(inserts.length, 2);
  assert.deepEqual(inserts[0].params.slice(5, 11), [2, 3, 2, 1, 2, 10]);
  assert.match(
    readFileSync(new URL('../server/integrations/nazem/dailyTasks.js', import.meta.url), 'utf8'),
    /!\['pending', 'not_done'\]\.includes\(task\.studentStatus\)/,
  );
});

test('Nazem overdue memorization is imported and blocks later memorization amounts', () => {
  const pending = mapNazemPendingFollowUps({
    late_items: [
      {
        id: 701,
        date: '2026-09-01',
        status: 'not_completed',
        surah_from: 58,
        verse_from: 7,
        surah_to: 58,
        verse_to: 11,
      },
      {
        id: 700,
        date: '2026-08-31',
        status: 'completed',
        surah_from: 58,
        verse_from: 1,
        surah_to: 58,
        verse_to: 6,
      },
    ],
  }, { remoteType: 'conserve', attendanceStatus: 2 });
  assert.deepEqual(pending.map((day) => ({
    id: day.id,
    date: day.date,
    taskType: day.taskType,
    nazemLate: day.nazemLate,
    from: [day.surah_from, day.verse_from],
    to: [day.surah_to, day.verse_to],
  })), [{
    id: 701,
    date: '2026-09-01',
    taskType: 'memorization',
    nazemLate: true,
    from: [58, 7],
    to: [58, 11],
  }]);

  const rows = [
    { id: 1, studentId: 9, planId: 7, taskType: 'memorization', taskDate: '2026-09-01', nazemManaged: 1 },
    { id: 2, studentId: 9, planId: 7, taskType: 'link', taskDate: '2026-09-01', nazemManaged: 1 },
    { id: 3, studentId: 9, planId: 7, taskType: 'memorization', taskDate: '2026-09-02', nazemManaged: 1 },
    { id: 4, studentId: 9, planId: 7, taskType: 'memorization', taskDate: '2026-09-03', nazemManaged: 1 },
    { id: 5, studentId: 9, planId: 7, taskType: 'review', taskDate: '2026-09-02', nazemManaged: 1 },
    { id: 6, studentId: 10, planId: 8, taskType: 'memorization', taskDate: '2026-09-03', nazemManaged: 0 },
  ];
  assert.deepEqual(selectNazemFirstActionableTasks(rows).map((row) => row.id), [1, 2, 5, 6]);
  assert.deepEqual(
    selectNazemFirstActionableTasks(rows.filter((row) => ![1, 2].includes(row.id))).map((row) => row.id),
    [3, 5, 6],
  );
});

test('Nazem follow-up collections accept arrays, wrapped data, and keyed objects', () => {
  const first = { id: 701, status: 'not_completed' };
  const second = { id: 702, status: 'pending' };
  assert.deepEqual(normalizeNazemFollowUpItems([first, null]), [first]);
  assert.deepEqual(normalizeNazemFollowUpItems({ data: [first, second] }), [first, second]);
  assert.deepEqual(normalizeNazemFollowUpItems({ 701: first, 702: second }), [first, second]);
});

test('Nazem daily mastery uses its own track without overwriting the memorization plan', async () => {
  const queries = [];
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.includes('FROM student_quran_plans')) return [[{ id: 7, studentId: 9, track: 'memorization' }]];
      if (sql.includes('FROM quran_ayah_pages')) return [[{ page: 3 }]];
      if (sql.includes('FROM student_quran_tasks t')) return [[]];
      return [{ affectedRows: 1, insertId: 44 }];
    },
  };
  await syncNazemScheduledTaskRange(connection, { planId: 7, studentId: 9, teacherId: 12 }, {
    id: 88, remoteType: 'master', taskType: 'memorization', date: '2026-08-30',
    surah_from: 58, verse_from: 1, surah_to: 58, verse_to: 6,
  });
  assert.ok(!queries.some(({ sql }) => sql.includes('UPDATE student_quran_plans SET track')));
  assert.ok(!queries.some(({ sql }) => sql.includes('UPDATE student_quran_tasks SET track')));
  const inserts = queries.filter(({ sql }) => sql.includes('INSERT INTO student_quran_tasks'));
  assert.deepEqual(inserts.map(({ params }) => [params[3], params[4]]), [
    ['memorization', 'mastery'], ['repeat', 'mastery'],
  ]);
  const daily = queries.find(({ sql }) => sql.includes('INSERT INTO nazem_daily_follow_up_links'));
  assert.equal(daily.params[5], 'mastery');
});

test('Nazem teacher session only exposes the daily task types confirmed by Nazem', () => {
  const serverSource = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  const serviceSource = readFileSync(new URL('../server/integrations/nazem/service.js', import.meta.url), 'utf8');
  const taskListSource = readFileSync(new URL('../src/components/portal/TeacherRecitationTaskList.jsx', import.meta.url), 'utf8');
  const filterStart = serverSource.indexOf('const nazemUnrecordedTaskFilter');
  const filterSource = serverSource.slice(filterStart, serverSource.indexOf('const [candidateRows]', filterStart));
  assert.match(serverSource, /scheduledDay\.remote_snapshot IS NOT NULL/);
  assert.match(serverSource, /t\.track <> 'mastery'/);
  assert.match(serverSource, /p\.link_pages > 0/);
  assert.match(filterSource, /JSON_EXTRACT\(recordedDay\.remote_snapshot, '\$\.status'\)/);
  assert.match(filterSource, /IN \('completed', 'partial', 'completed_early', 'partial_early', 'completed_late'\)/);
  assert.match(serverSource, /recitationFinished: attemptedStudentIds\.has/);
  assert.match(filterSource, /managedTaskSetting\.setting_value = 'true'/);
  assert.doesNotMatch(serverSource, /quran-evaluation\/:taskId\/nazem-retry|nazemRetryAvailable/);
  assert.match(serverSource, /actionAttempt\.task_id = t\.id\s*AND actionAttempt\.is_official = 1[\s\S]*?actionAttempt\.teacher_completed = 1/);
  assert.doesNotMatch(filterSource, /recordedDay\.sync_status = 'synced'/);
  assert.match(filterSource, /JSON_EXTRACT\(scheduledDay\.remote_snapshot, '\$\.surah_from'\)/);
  assert.doesNotMatch(serverSource, /const nazemPendingOrderFilter/);
  assert.match(serverSource, /t\.task_date = '\$\{date\}' OR \$\{buildNazemLateTaskExistsSql/);
  assert.match(serverSource, /const rows = selectNazemFirstActionableTasks\(allRows, nazemAuthorities\)/);
  assert.match(serverSource, /taskQueue: allRows[\s\S]*?isRecitationAttendanceVisible[\s\S]*?\.map\(serializeEvaluationTask\)/);
  assert.match(serverSource, /qps\.name_arabic AS planStartSurahName/);
  assert.match(serverSource, /surahName: task\.fromSurahName \|\| ''/);
  assert.match(serverSource, /canSetAttendance: teacherAttendanceMode,/);
  assert.doesNotMatch(serverSource, /حالة الطالب تُؤخذ من ناظم تلقائيًا/);
  assert.match(serverSource, /teacherMode[\s\S]*enqueueNazemAttendance/);
  assert.match(serverSource, /if \(\['absent', 'excused'\]\.includes\(attendanceStatus\)\) return false;[\s\S]*activeTaskStudentIds\.has/);
  assert.match(taskListSource, /attendanceEditable && \(/);
  assert.doesNotMatch(taskListSource, /student\.nazemManaged && attendanceLabel/);
  assert.doesNotMatch(filterSource, /recordedAttempt/);
  assert.match(serviceSource, /teacherId: job\.teacherId,[\s\S]+syncNazemScheduledTaskRange/);
});

test('unmatched students stay in the import flow without creating false review alerts', () => {
  const routes = readFileSync(new URL('../server/routes/nazemIntegrationRoutes.js', import.meta.url), 'utf8');
  assert.match(routes, /planCandidateSummary[\s\S]*COALESCE\(last_error_code, ''\) <> 'NAZEM_PLAN_STUDENT_UNMATCHED'/);
  assert.match(routes, /candidate\.last_error_code[\s\S]*<> 'NAZEM_PLAN_STUDENT_UNMATCHED'/);
  assert.match(routes, /UPDATE nazem_plan_candidates SET ruwasi_student_id = \?[\s\S]*last_error_code = NULL, last_error = NULL/);
});

test('Nazem follow-up reads are shared per plan and date while post-save verification stays fresh', () => {
  const adapterSource = readFileSync(new URL('../server/integrations/nazem/adapter.js', import.meta.url), 'utf8');
  const workerSource = readFileSync(new URL('../server/workers/nazemSyncWorker.js', import.meta.url), 'utf8');
  assert.match(adapterSource, /followUpPayloadCache = new Map/);
  assert.match(adapterSource, /if \(!fresh && this\.followUpPayloadCache\.has\(cacheKey\)\)/);
  assert.match(adapterSource, /verifySubmittedRecitation\(studentLink, planLink, \{ \.\.\.mapped, nazemSourceDayId: initial\.day\.id \}\)/);
  assert.doesNotMatch(workerSource, /NAZEM_RECONCILIATION_HOURS|enqueueReconciliationJobs/);
});

test('Nazem full refresh is manual while outgoing recitations refresh only their student', () => {
  const queueSource = readFileSync(new URL('../server/integrations/nazem/queue.js', import.meta.url), 'utf8');
  const serverSource = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  const dialogSource = readFileSync(new URL('../src/components/portal/TeacherEvaluationDialog.jsx', import.meta.url), 'utf8');
  const apiSource = readFileSync(new URL('../src/services/studentsApi.js', import.meta.url), 'utf8');
  const workerSource = readFileSync(new URL('../server/workers/nazemSyncWorker.js', import.meta.url), 'utf8');
  const serviceSource = readFileSync(new URL('../server/integrations/nazem/service.js', import.meta.url), 'utf8');
  assert.doesNotMatch(queueSource, /enqueueImmediateNazemReconciliation|requestedFrom = 'teacher-evaluation'/);
  assert.match(queueSource, /nextAttemptAt: null/);
  assert.match(queueSource, /status IN \('failed','blocked','requires_review','conflict','dismissed'\)/);
  assert.doesNotMatch(serverSource, /req\.query\.refreshNazem|enqueueImmediateNazemReconciliation/);
  assert.match(serverSource, /operation_type = 'recitation\.submit'[\s\S]*student_id IS NOT NULL/);
  assert.match(apiSource, /getSupervisorQuranEvaluation: loadTeacherEvaluation/);
  assert.match(apiSource, /const loadTeacherEvaluation = refreshableSingleFlight\([\s\S]*quran-evaluation`/);
  assert.doesNotMatch(apiSource, /refreshNazem/);
  const evaluationLoader = readFileSync(new URL('../src/hooks/useTeacherEvaluationData.js', import.meta.url), 'utf8');
  assert.match(dialogSource, /useTeacherEvaluationData\(/);
  assert.match(evaluationLoader, /const evaluation = await studentsApi\.getSupervisorQuranEvaluation\(supervisorId, \{ fresh \}\)/);
  assert.doesNotMatch(dialogSource, /refreshNazem|NAZEM_REFRESH_POLL_MS/);
  assert.match(dialogSource, /data\?\.nazemRefreshPending/);
  assert.match(workerSource, /enqueueNazemFollowUpRefresh/);
  assert.doesNotMatch(dialogSource, /setInterval\(refreshLocal, 10_000\)/);
  assert.match(dialogSource, /load\(\{ silent: true \}\)/);
  assert.match(workerSource, /NAZEM_MANUAL_REFRESH_ONLY/);
  assert.doesNotMatch(workerSource, /enqueuePeriodicAccountJobs|NAZEM_PLAN_DISCOVERY_MINUTES/);
  assert.match(serviceSource, /refreshStudentFollowUpsAfterRecitation/);
  assert.match(serviceSource, /adapter\.readStudentFollowUpHistory\(nazemPlanId, studentLink, 1\)/);
  assert.match(dialogSource, /syncOfflineRecitations\(supervisorId, \{ force: true \}\)/);
  assert.doesNotMatch(dialogSource, /ستُرسل تلقائيًا|سيُرسل إلى ناظم/);
  const taskListSource = readFileSync(new URL('../src/components/portal/TeacherRecitationTaskList.jsx', import.meta.url), 'utf8');
  assert.match(taskListSource, /action\.tasks\.some\(\(task\) => task\.nazemManaged\)/);
  assert.match(taskListSource, /hasRecitationTasks && canRecite/);
  assert.match(taskListSource, /attendanceControlled = attendanceEditable[\s\S]*student\.canSetAttendance \|\| student\.nazemManaged/);
  assert.doesNotMatch(taskListSource, /isNazemAmountPending|يجري تحميل مقدار ناظم/);
  assert.match(serverSource, /if \(Number\(row\.nazemManaged\)\) return true;/);
  assert.match(serverSource, /!Number\(task\.nazemManaged\) && !canTeacherExecuteQuranTask/);
});

test('Nazem plans stay managed remotely while ordinary review permits an endpoint within its schedule', () => {
  const plansSource = readFileSync(new URL('../src/components/dashboard/StudentPlansSection.jsx', import.meta.url), 'utf8');
  const taskListSource = readFileSync(new URL('../src/components/portal/TeacherRecitationTaskList.jsx', import.meta.url), 'utf8');
  const serverSource = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  assert.match(plansSource, /row\.plan && !row\.nazemManaged/);
  assert.match(serverSource, /isStudentPlanManagedByNazem\(connection, studentId\)[\s\S]*rejectNazemManagedPlanChange\(res\)/);
  assert.match(taskListSource, /\['saved', 'review', 'mastery'\]\.includes\(action\.key\)/);
  assert.doesNotMatch(taskListSource, /label: 'التعويض'|key: 'compensation'|task\.nazemCompensation/);
  assert.match(taskListSource, /actualEnd: hasNazemFixedRange\(action\.tasks\[0\]\) \|\| nazemLate[\s\S]*selectedEnds\[actionKey\] \|\| action\.tasks\[0\]\?\.normalEnd/);
  assert.match(taskListSource, /chapters=\{\['saved', 'review', 'mastery'\]\.includes\(action\.key\) \? quranChapters : \[\]\}/);
  assert.match(taskListSource, /allowedEnd=\{firstTask\.selectionEnd\}/);
  const evaluationSource = readFileSync(new URL('../src/components/portal/TeacherEvaluationDialog.jsx', import.meta.url), 'utf8');
  assert.match(evaluationSource, /studentsApi\.getQuranChapters\(\)/);
  assert.match(evaluationSource, /quranChapters=\{quranChapters\}/);
  assert.match(serverSource, /item\.taskType === 'review' && Number\(item\.nazemManaged\)/);
  assert.match(serverSource, /const allowedEnd = fixedRange \|\| anchor\.taskType === 'review'/);
});

test('Nazem late completion keeps its original range in Rawasi', () => {
  const serverSource = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  const serviceSource = readFileSync(new URL('../server/integrations/nazem/service.js', import.meta.url), 'utf8');
  const taskListSource = readFileSync(new URL('../src/components/portal/TeacherRecitationTaskList.jsx', import.meta.url), 'utf8');
  const evaluationRoute = serverSource.slice(
    serverSource.indexOf('const rateSupervisorQuranTaskHandler'),
    serverSource.indexOf("app.post('/api/supervisors/:id/quran-evaluation/:taskId'"),
  );

  assert.match(readFileSync(new URL('../server/integrations/nazem/lateTaskScope.js', import.meta.url), 'utf8'), /function buildNazemLateTaskExistsSql/);
  assert.match(evaluationRoute, /buildNazemLateTaskExistsSql\('t', \{ includePending: false \}\).*AS nazemLate/);
  assert.match(serverSource, /nazemLate: Boolean\(Number\(row\.nazemManaged\) && Number\(row\.nazemLate\)\)/);
  assert.match(serverSource, /const allowedEnd = fixedRange[\s\S]*\? expectedEnd/);
  assert.match(serverSource, /const candidates = fixedRange \? \[scheduledEnd\]/);
  assert.match(serverSource, /fixedRange && !isSameQuranPosition\(requestedEnd, expectedEnd\)/);
  assert.match(serverSource, /مقدار التسميع ثابت كما ورد من ناظم/);
  assert.match(serverSource, /Number\(task\.nazemManaged\) && Number\(task\.nazemLate\)[\s\S]*actual_to_page = to_page/);
  assert.match(taskListSource, /const nazemLate = action\.tasks\.some\(\(task\) => Boolean\(task\.nazemLate\)\)/);
  assert.match(taskListSource, /\['saved', 'review', 'mastery'\]\.includes\(action\.key\)[\s\S]*&& !nazemLate/);
  assert.match(taskListSource, /label=\{action\.label\}/);
  assert.doesNotMatch(taskListSource, /إكمال المتأخر/);
  assert.match(taskListSource, /actualEnd: hasNazemFixedRange\(action\.tasks\[0\]\) \|\| nazemLate[\s\S]*\? action\.tasks\[0\]\?\.normalEnd/);
  const lateScope = readFileSync(new URL('../server/integrations/nazem/lateTaskScope.js', import.meta.url), 'utf8');
  assert.match(lateScope, /nazemLateAvailableOn/);
  assert.doesNotMatch(lateScope, /not_completed/);
  assert.match(serviceSource, /recitationLink\.sync_status = 'conflict'[\s\S]*attempt\.teacher_completed = 1[\s\S]*recitationDay\.remote_snapshot/);
  assert.match(serviceSource, /DATE_FORMAT\(attempt\.session_date, '%Y-%m-%d'\) AS sessionDate/);
  const adapterSource = readFileSync(new URL('../server/integrations/nazem/adapter.js', import.meta.url), 'utf8');
  assert.match(adapterSource, /lateLookupDate = initial\.followUpDate/);
  assert.match(adapterSource, /openFollowUp\(planLink\.nazemPlanId, lateLookupDate, \{ fresh: true \}\)/);
});

test('Nazem linking has an independent evaluation and sends actual count without local marks', () => {
  const queueSource = readFileSync(new URL('../server/integrations/nazem/queue.js', import.meta.url), 'utf8');
  const serviceSource = readFileSync(new URL('../server/integrations/nazem/service.js', import.meta.url), 'utf8');
  const serverSource = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  const taskListSource = readFileSync(new URL('../src/components/portal/TeacherRecitationTaskList.jsx', import.meta.url), 'utf8');
  const dailyTasksSource = readFileSync(new URL('../server/integrations/nazem/dailyTasks.js', import.meta.url), 'utf8');
  assert.match(queueSource, /\['memorization', 'review', 'link'\]\.includes\(submittedTaskType\)/);
  assert.match(queueSource, /loadNazemRecitationBarrier/);
  assert.match(serviceSource, /SUM\(linkMetric\.actual_link_count\)/);
  assert.doesNotMatch(dailyTasksSource, /DELETE linkTask/);
  assert.match(serverSource, /ensureNazemLinkTasks/);
  assert.match(serverSource, /!notMemorized && Number\(firstLink\.id\) === taskId \? readNazemLinkCount\(task\.nazemLinkCount\) : 0/);
  assert.doesNotMatch(taskListSource, /NazemLinkCountSelector/);
  assert.doesNotMatch(taskListSource, /action\.key === 'link'.*return false/);
});

test('Nazem memorization no longer waits for a separate link attempt', () => {
  const memorization = { taskType: 'memorization', track: 'memorization', attemptId: 11 };
  const pendingLink = { taskType: 'link', track: 'memorization', attemptId: null };
  assert.deepEqual(resolveNazemRecitationBarrier([memorization, pendingLink], 'memorization'), {
    ready: true,
    sourceAttemptId: 11,
    attemptSignature: '11',
  });
  assert.deepEqual(resolveNazemRecitationBarrier([
    { taskType: 'memorization', track: 'mastery', attemptId: 21 },
    pendingLink,
  ], 'memorization'), {
    ready: true,
    sourceAttemptId: 21,
    attemptSignature: '21',
  });
  const queueSource = readFileSync(new URL('../server/integrations/nazem/queue.js', import.meta.url), 'utf8');
  const serviceSource = readFileSync(new URL('../server/integrations/nazem/service.js', import.meta.url), 'utf8');
  assert.match(queueSource, /nazem:recitation-day:\$\{dailyFollowUpId\}:\$\{barrier\.attemptSignature\}/);
  assert.match(queueSource, /SELECT recitationLink\.sync_status AS syncStatus/);
  assert.match(serviceSource, /recitationLink\.sync_status = 'pending'/);
  assert.match(queueSource, /remoteMatchesLatestAttempt/);
  assert.match(serviceSource, /attempt\.teacher_completed = 1[\s\S]*completed_late/);
  assert.match(serviceSource, /hasPendingRecitation/);
  assert.match(serviceSource, /wakeNextBlockedNazemRecitation/);
  assert.match(serviceSource, /NAZEM_PREVIOUS_DAYS_BLOCKING','NAZEM_RECITATION_START_CONFLICT/);
});

test('Nazem inline link count accepts only whole values from zero to forty', () => {
  assert.equal(normalizeNazemLinkCount(5), 5);
  assert.equal(normalizeNazemLinkCount(55), 40);
  assert.equal(normalizeNazemLinkCount(-3), 0);
  assert.equal(normalizeNazemLinkCount('bad', 7), 7);
  assert.equal(isValidNazemLinkCount(0), true);
  assert.equal(isValidNazemLinkCount(40), true);
  assert.equal(isValidNazemLinkCount(41), false);
  assert.equal(isValidNazemLinkCount(2.5), false);
});

test('Nazem daily follow-up verification covers every field used by the current contract', () => {
  const conserve = {
    completed: true,
    remoteType: 'conserve',
    remoteMistakeCount: 2,
    listeningCount: 4,
    repeatCount: 8,
    linkCount: 3,
  };
  assert.equal(nazemFollowUpMetricsMatch({
    mistake: 2,
    hearing: 1,
    repetition: 8,
    link: 3,
  }, conserve), true);
  assert.equal(nazemFollowUpMetricsMatch({
    mistake: 2,
    hearing: 4,
    repetition: 8,
    link: 3,
  }, conserve), false);
  assert.equal(nazemFollowUpMetricsMatch({ mistake: 2, tune: 5 }, {
    completed: true,
    remoteType: 'revision',
    remoteMistakeCount: 2,
    remoteTuneCount: 5,
  }), true);
});

test('editing a Ruwasi plan preserves its Nazem plan identity for an exact update', async () => {
  const calls = [];
  const responses = [
    [[{ id: 9, teacherId: 42, syncStatus: 'synced' }]],
    [[]],
  ];
  const connection = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return responses.shift() || [{ affectedRows: 1 }];
    },
  };
  const teacherId = await prepareNazemPlanReplacement(connection, {
    oldPlanId: 10,
    newPlanId: 11,
    studentId: 7,
    actor: { role: 'supervisor', id: 42 },
  });
  assert.equal(teacherId, 42);
  const linkUpdate = calls.find(({ sql }) => sql.includes('UPDATE nazem_plan_links SET ruwasi_plan_id'));
  assert.deepEqual(linkUpdate.params, [11, 7, 9]);
  assert.match(calls.find(({ sql }) => sql.includes('UPDATE nazem_sync_jobs')).sql, /status = 'dismissed'/);
});

test('editing waits instead of racing an active Nazem plan synchronization', async () => {
  const connection = {
    query: async (sql) => {
      if (sql.includes('FROM nazem_plan_links')) {
        return [[{ id: 9, teacherId: 42, syncStatus: 'syncing' }]];
      }
      return [[{ id: 77 }]];
    },
  };
  await assert.rejects(
    prepareNazemPlanReplacement(connection, {
      oldPlanId: 10,
      newPlanId: 11,
      studentId: 7,
      actor: { role: 'supervisor', id: 42 },
    }),
    (error) => error.code === 'NAZEM_PLAN_SYNC_ACTIVE' && error.statusCode === 409,
  );
});

test('Nazem browser access remains server-side and isolated in one adapter', () => {
  const frontendService = readFileSync(
    new URL('../src/services/nazemIntegrationApi.js', import.meta.url),
    'utf8',
  );
  const adapter = readFileSync(
    new URL('../server/integrations/nazem/adapter.js', import.meta.url),
    'utf8',
  );
  const worker = readFileSync(
    new URL('../server/workers/nazemSyncWorker.js', import.meta.url),
    'utf8',
  );
  const service = readFileSync(
    new URL('../server/integrations/nazem/service.js', import.meta.url),
    'utf8',
  );
  const queue = readFileSync(
    new URL('../server/integrations/nazem/queue.js', import.meta.url),
    'utf8',
  );
  const routes = readFileSync(
    new URL('../server/routes/nazemIntegrationRoutes.js', import.meta.url),
    'utf8',
  );
  const serverIndex = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  const migrations = readFileSync(new URL('../server/databaseMigrations.js', import.meta.url), 'utf8');
  const conflictDialog = readFileSync(
    new URL('../src/components/dashboard/NazemConflictsDialog.jsx', import.meta.url),
    'utf8',
  );
  const conflictCard = readFileSync(
    new URL('../src/components/dashboard/NazemConflictCard.jsx', import.meta.url),
    'utf8',
  );

  assert.equal(frontendService.includes('nazem-plus.com'), false);
  assert.equal(adapter.includes("const NAZEM_BASE_URL = 'https://nazem-plus.com'"), true);
  assert.equal(adapter.includes('async createPlan('), true);
  assert.equal(adapter.includes('async waitForPlanPreview('), true);
  assert.match(adapter, /لن تُحفظ خطة بلا ورد مجدول/);
  assert.equal(adapter.includes('async readPlanBundle('), true);
  assert.match(adapter, /locator\('tbody > tr'\)/);
  assert.match(adapter, /const planCardLabel = .*replace\(\/\^ال\//);
  assert.match(adapter, /hasText: planCardLabel\(expectedTab\)/);
  assert.match(adapter, /locator\('\.epe-student__name'\)/);
  assert.match(adapter, /async getPlanStudentIdentities\(\)/);
  assert.match(adapter, /\['data-student-id', 'data-id', 'data-value', 'data-key'\]/);
  assert.match(adapter, /String\(identity\.externalId\) === expectedId/);
  assert.match(adapter, /identities\.filter\(\(identity\) => identity\.normalizedName === expectedName\)/);
  assert.equal(adapter.includes('async verifyPlan('), true);
  assert.equal(adapter.includes('async submitRecitation('), true);
  assert.equal(adapter.includes('async readFollowUpApi('), true);
  assert.match(adapter, /followUpApiPathTemplate[\s\S]*followUpApiPaths/);
  assert.equal(adapter.includes('/not-completed'), true);
  assert.equal(adapter.includes('/partial'), true);
  assert.equal(adapter.includes('async verifyRecitation('), true);
  assert.match(adapter, /تأكيد الحفظ/);
  assert.match(adapter, /eduPlansFollowUp/);
  assert.match(adapter, /groupPageSignatures/);
  assert.match(adapter, /name: 'Next page'[\s\S]*nextPage\.isDisabled\(\)/);
  assert.match(adapter, /تم تحديث بنود الخطة بنجاح/);
  assert.match(adapter, /NAZEM_RECITATION_SCHEDULED_END_CONFLICT/);
  assert.equal(worker.includes('claimNextNazemJob'), true);
  assert.match(worker, /startLeaseHeartbeat/);
  assert.match(worker, /finalizeSuccessfulJob/);
  assert.match(service, /export async function enqueueMissingNazemRecitations/);
  assert.match(service, /attempt\.is_official = 1[\s\S]*task\.task_type IN \('memorization', 'review', 'link'\)[\s\S]*NAZEM_PLAN_SYNC_PENDING/);
  assert.match(service, /newer\.task_id = attempt\.task_id[\s\S]*newer\.attempt_number > attempt\.attempt_number/);
  assert.match(service, /task\.task_type AS taskType/);
  assert.match(service, /ruwasi_plan_id = \? AND teacher_id = \? AND ruwasi_student_id = \?/);
  assert.match(service, /partitionQuranRevisionPages/);
  assert.match(service, /student_quran_plan_prior_memorization/);
  assert.match(service, /backfilledRecitations/);
  assert.doesNotMatch(service, /enqueueExistingNazemPlansForTeacher/);
  const verifyAccount = service.slice(
    service.indexOf('async function verifyAccount'),
    service.indexOf('async function loadPlan'),
  );
  assert.doesNotMatch(verifyAccount, /operationType: 'account\.reconcile'|adapter\.getStudents\(\)/);
  assert.doesNotMatch(verifyAccount, /discoverStudentPlans/);
  assert.doesNotMatch(service, /confidence < 0\.67/);
  assert.match(service, /if \(identityChanged && !identityWasConfirmed\)/);
  assert.match(service, /requiresNazemIdentityReview\(\{/);
  assert.match(service, /NAZEM_TEACHER_MISMATCH/);
  assert.doesNotMatch(service, /attempt\.teacher_completed = 0 AND COALESCE\(JSON_UNQUOTE\(JSON_EXTRACT\(recitationLink\.remote_snapshot/);
  assert.match(queue, /NAZEM_JOB_SUPERSEDED/);
  assert.match(queue, /attendance_records[\s\S]*\['absent', 'excused'\]\.includes\(attendance\?\.status\)/);
  assert.match(queue, /lease_owner = \?[\s\S]*status = 'syncing'/);
  assert.match(queue, /attempt_count = IF\(operation_type <> 'recitation\.submit' AND status IN/);
  assert.match(queue, /loadNazemRecitationBarrier/);
  assert.match(queue, /primary\.every\(\(row\) => Number\(row\.attemptId/);
  assert.match(queue, /idempotencyKey: `nazem:recitation-day:\$\{dailyFollowUpId\}:\$\{barrier\.attemptSignature\}`/);
  assert.match(queue, /idempotencyKey: `nazem:recitation-day:[\s\S]*maxAttempts: 2/);
  assert.match(worker, /recoverTenantRecitations/);
  assert.match(worker, /operation_type = 'recitation\.submit' AND status = 'failed'/);
  assert.match(worker, /NAZEM_ATTENDANCE_SKIPPED/);
  assert.match(worker, /NAZEM_REVISION_RANGE_DISCONNECTED/);
  assert.match(service, /throw reviewNazemError\([\s\S]*NAZEM_REVISION_RANGE_DISCONNECTED/);
  assert.match(routes, /identity_confirmed_fingerprint = NULL/);
  assert.match(routes, /last_error_code AS lastErrorCode/);
  assert.match(serverIndex, /path\.startsWith\('\/nazem'\).*\['settings'\]/);
  assert.match(serverIndex, /resolveNazemPlanResumeDate\(\{[\s\S]*progressDate: progress\?\.date \|\| null/);
  const planEditRoute = serverIndex.slice(
    serverIndex.indexOf("app.put('/api/student-plans/:studentId'"),
    serverIndex.indexOf("app.delete('/api/student-plans/:studentId'"),
  );
  assert.match(planEditRoute, /prepareNazemPlanReplacement/);
  assert.match(planEditRoute, /enqueueNazemPlanUpsert/);
  assert.match(planEditRoute, /nazemSyncStatus: nazemJobId \? 'pending' : null/);
  assert.doesNotMatch(planEditRoute, /enqueueNazemPlanDeletion/);
  const dailyEvaluationRoute = serverIndex.slice(
    serverIndex.indexOf('const rateSupervisorQuranTaskHandler'),
    serverIndex.indexOf("app.post('/api/supervisors/:id/quran-evaluation/:taskId'"),
  );
  assert.match(dailyEvaluationRoute, /is_official,[\s\S]*enqueueNazemRecitation/);
  assert.doesNotMatch(dailyEvaluationRoute, /waitForNazemRecitationDelivery|setTimeout/);
  assert.doesNotMatch(serverIndex, /NAZEM_RECITATION_IMMEDIATE_WAIT_MS/);
  assert.match(dailyEvaluationRoute, /syncStatus: _resolveSyncStatus\(\)/);
  assert.match(dailyEvaluationRoute, /if \(task\.nazemManaged\) \{\s*if \(nazemJobId\) \{\s*return 'pending';\s*\}\s*return 'awaiting_related_tasks';\s*\}\s*return 'synced';/);
  assert.match(dailyEvaluationRoute, /if \(notMemorized\) \{\s*return nazemNotCompletedLabel\(task\);/);
  assert.doesNotMatch(dailyEvaluationRoute, /nazemSyncStatus/);
  assert.match(migrations, /rollbackLastDatabaseMigration/);
  assert.match(conflictDialog, /NazemConflictCard/);
  assert.match(conflictCard, /value\.primary/);
});

test('Nazem worker always processes the primary database and deduplicates tenant databases', () => {
  assert.deepEqual(buildNazemTenantScope([
    { registrationNumber: '1', name: 'عميل', databaseName: 'tenant_1' },
    { registrationNumber: '2', name: 'مكرر', databaseName: 'wajeh_madarij' },
  ], 'wajeh_madarij'), [
    { registrationNumber: '', name: 'الحبيب ماب', databaseName: 'wajeh_madarij' },
    { registrationNumber: '1', name: 'عميل', databaseName: 'tenant_1' },
  ]);
});

test('database migrations keep numeric order so Nazem hardening runs after version 9', async () => {
  const versions = (await loadDatabaseMigrations()).map((migration) => migration.version);
  assert.ok(versions.indexOf('2026.08.24.9.1') < versions.indexOf('2026.08.24.10'));
  assert.deepEqual(
    versions.filter((version) => version.startsWith('2026.08.24.10')),
    ['2026.08.24.10', '2026.08.24.10.1', '2026.08.24.10.2', '2026.08.24.10.3'],
  );
  assert.ok(versions.includes('2026.08.25.1'));
  assert.ok(versions.includes('2026.08.25.2'));
  assert.ok(versions.includes('2026.08.25.3'));
  assert.ok(versions.includes('2026.09.02.1'));
  assert.ok(versions.includes('2026.09.04.1'));
});

test('Nazem discovers student plans and treats Nazem as the authoritative import source', () => {
  const adapter = readFileSync(
    new URL('../server/integrations/nazem/adapter.js', import.meta.url),
    'utf8',
  );
  const conflictDialog = readFileSync(
    new URL('../src/components/dashboard/NazemConflictsDialog.jsx', import.meta.url),
    'utf8',
  );
  const service = readFileSync(
    new URL('../server/integrations/nazem/service.js', import.meta.url),
    'utf8',
  );
  const queue = readFileSync(
    new URL('../server/integrations/nazem/queue.js', import.meta.url),
    'utf8',
  );
  const worker = readFileSync(
    new URL('../server/workers/nazemSyncWorker.js', import.meta.url),
    'utf8',
  );
  const routes = readFileSync(
    new URL('../server/routes/nazemIntegrationRoutes.js', import.meta.url),
    'utf8',
  );
  const settings = readFileSync(
    new URL('../src/components/dashboard/NazemIntegrationSettings.jsx', import.meta.url),
    'utf8',
  );
  const importDialog = readFileSync(
    new URL('../src/components/dashboard/NazemStudentPlanImportDialog.jsx', import.meta.url),
    'utf8',
  );
  const refreshSummary = readFileSync(
    new URL('../src/components/dashboard/NazemPlanRefreshSummary.jsx', import.meta.url),
    'utf8',
  );
  const integrationApi = readFileSync(
    new URL('../src/services/nazemIntegrationApi.js', import.meta.url),
    'utf8',
  );
  const integrationStateCache = readFileSync(
    new URL('../src/services/nazemIntegrationStateCache.js', import.meta.url),
    'utf8',
  );
  const progressBar = readFileSync(
    new URL('../src/components/ui/progress-bar.jsx', import.meta.url),
    'utf8',
  );
  const progressMigration = readFileSync(
    new URL('../server/migrations/2026.08.25.6-nazem-sync-job-progress.js', import.meta.url),
    'utf8',
  );
  const accountSummaryIndexMigration = readFileSync(
    new URL('../server/migrations/2026.09.04.1-nazem-account-summary-index.js', import.meta.url),
    'utf8',
  );
  const serverIndex = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  const accountsRoute = routes.slice(
    routes.indexOf("router.get('/accounts'"),
    routes.indexOf("router.get('/accounts/:teacherId/issues'"),
  );
  assert.match(adapter, /async discoverStudentPlans/);
  assert.match(adapter, /NAZEM_LOGIN_REJECTED/);
  assert.match(adapter, /loginPageAttempt < 2/);
  assert.match(adapter, /timeout: 12_000/);
  assert.match(adapter, /NAZEM_LOGIN_FORM_TIMEOUT/);
  assert.match(adapter, /These credentials do not match our records/);
  assert.match(adapter, /daysAgo < 7/);
  assert.match(adapter, /new URL\(response\.url\(\)\)\.pathname\.endsWith\('\/api\/educational-plans'\)/);
  assert.match(adapter, /extractNazemPlanApiPage/);
  assert.match(adapter, /document\.querySelectorAll\('\.epe-student'\)\.length >= expectedCount/);
  assert.match(adapter, /planStudentIds\.has\(String\(student\.externalId\)\)/);
  assert.match(adapter, /fallbackStudentNames\.has\(normalizeArabicPersonName\(student\.name\)\)/);
  assert.match(adapter, /return \{ plans: discovered, issues, students: discoveredStudents \}/);
  assert.match(adapter, /mergeNazemStudentSources\(students, profiles, availableContexts\)/);
  assert.match(adapter, /readPlan\(group\.externalId, studentLink, 'الحفظ', \{ navigate: false \}\)/);
  assert.match(adapter, /onProgress\(completedProgressUnits, totalProgressUnits\)/);
  assert.match(adapter, /async getPlanEditSaveButton\(\)/);
  assert.match(adapter, /async capturePlanApiSession/);
  assert.match(adapter, /response\.status\(\) === 401/);
  assert.match(adapter, /async getPlanGroupDetails/);
  assert.match(adapter, /mapNazemApiPlanBundle/);
  assert.match(adapter, /apiAttempt < 2/);
  assert.match(adapter, /if \(planApiError\) throw planApiError/);
  assert.match(adapter, /NAZEM_PLAN_LIST_LOAD_INCOMPLETE/);
  assert.doesNotMatch(queue, /NAZEM_PLAN_LIST_CONTRACT_CHANGED/);
  assert.match(service, /NAZEM_MULTIPLE_ACTIVE_PLANS/);
  assert.doesNotMatch(service, /NAZEM_LOCAL_REMOTE_PLAN_CONFLICT/);
  assert.doesNotMatch(service, /NAZEM_PLAN_PROGRESS_UNKNOWN/);
  assert.match(queue, /nazem_plan_candidates/);
  assert.match(queue, /discovery_status IN \('discovered','requires_review','imported'\)/);
  assert.match(routes, /accounts\/:teacherId\/plans\/:candidateId\/import/);
  assert.match(routes, /accounts\/:teacherId\/plans\/import-bulk/);
  assert.match(routes, /accounts\/:teacherId\/import-preview/);
  assert.match(routes, /accounts\/:teacherId\/refresh-import/);
  assert.match(accountsRoute, /studentLinkSummary[\s\S]*GROUP BY teacher_id/);
  assert.match(accountsRoute, /planCandidateSummary[\s\S]*GROUP BY teacher_id/);
  assert.match(accountsRoute, /MAX\(id\) AS latestId[\s\S]*syncIssueSummary/);
  assert.doesNotMatch(accountsRoute, /\(SELECT COUNT\(\*\)/);
  assert.match(accountSummaryIndexMigration, /nazem_sync_jobs_entity_latest_lookup/);
  assert.match(routes, /studentIssues: \[\.\.\.jobIssues, \.\.\.studentIssues\]/);
  assert.doesNotMatch(settings, /عمليات تحتاج مراجعة:/);
  assert.match(settings, /Promise\.allSettled/);
  assert.match(settings, /configResult\.status === 'fulfilled'/);
  assert.match(settings, /readNazemIntegrationStateCache/);
  assert.match(settings, /writeNazemIntegrationStateCache/);
  assert.match(settings, /تظهر آخر بيانات محفوظة/);
  assert.match(settings, /setInterval\(refreshAccounts, 4_000\)/);
  assert.match(settings, /const updatedAccounts = await nazemIntegrationApi\.getAccounts\(\)/);
  assert.match(integrationApi, /statusRequestOptions = \{ timeoutMs: 30_000 \}/);
  assert.match(integrationStateCache, /globalThis\.sessionStorage/);
  assert.match(integrationStateCache, /accountsUpdatedAt/);
  assert.match(routes, /progress_percent AS progressPercent/);
  assert.match(routes, /metadata_json AS resultJson/);
  assert.match(routes, /result: parseSnapshot\(event\?\.resultJson\)/);
  assert.match(routes, /operationType: 'account\.reconcile'/);
  assert.match(routes, /status IN \('pending','syncing','retrying'\)/);
  assert.match(routes, /NAZEM_VERIFY_DEDUPLICATED/);
  assert.match(routes, /nazem_bulk_plan_/);
  assert.match(routes, /INSERT IGNORE INTO supervisor_committees/);
  assert.match(routes, /NAZEM_BULK_IMPORT_REVIEW/);
  assert.doesNotMatch(routes, /NAZEM_PLAN_PROGRESS_UNKNOWN/);
  assert.match(routes, /discovery_status IN \('discovered','requires_review'\)/);
  assert.match(routes, /\['use_ruwasi', 'use_nazem', 'ignore_remote'\]/);
  assert.match(routes, /resolution === 'use_nazem'[\s\S]*importPlanCandidate/);
  assert.match(routes, /remoteRepeatCount[\s\S]*actual_repeat_count = \?, actual_listening_count = \?/);
  assert.match(routes, /remoteLinkCount[\s\S]*actual_link_count = \?/);
  assert.match(routes, /applyRemoteAttendanceToRuwasi/);
  assert.match(adapter, /cause\.details\.remote[\s\S]*attendanceStatus/);
  assert.match(routes, /conflict\.teacher_id = \?/);
  assert.match(routes, /status IN \('pending','retrying'\)[\s\S]*lease_expires_at >= NOW\(3\)/);
  assert.match(queue, /job\.attempt_count < job\.max_attempts/);
  assert.match(queue, /attempt_count >= max_attempts, 'failed', 'retrying'/);
  assert.doesNotMatch(worker, /enqueuePeriodicAccountJobs|NAZEM_PLAN_DISCOVERY_MINUTES/);
  assert.match(worker, /NAZEM_MANUAL_REFRESH_ONLY/);
  assert.match(worker, /requestedFrom'\)\), ''\) <> 'student-plan-import'/);
  assert.doesNotMatch(worker, /notifyStaleNazemAccounts|notifyNazemFailure|notifyNazemRecovered/);
  assert.match(service, /case 'account\.discover_plans'/);
  assert.match(service, /refreshPlansRequested[\s\S]*requestedFrom === 'student-plan-import'/);
  assert.match(service, /student\.name AS studentName/);
  assert.match(service, /const planChanges = \[\]/);
  assert.match(service, /describeNazemPlanDifference\(localSnapshot, remoteSnapshot\)/);
  assert.match(service, /status: 'applied'[\s\S]*تم تحديث الخطة في رواسي من ناظم/);
  assert.match(service, /status: 'requires_review'/);
  assert.match(service, /discoveryIssues\.slice\(0, 20\)/);
  assert.match(service, /if \(!issues\.length && !preserveUndiscovered\)/);
  assert.match(queue, /requestedFrom'\)\) = 'student-plan-import'/);
  assert.match(routes, /JSON_SET\([\s\S]*student-plan-import/);
  assert.match(routes, /export async function importReadyNazemPlans/);
  assert.match(routes, /JSON_EXTRACT\(candidate\.remote_snapshot, '\$\.primary'\) IS NOT NULL/);
  assert.match(routes, /candidate\.discovery_status = 'requires_review'[\s\S]*NAZEM_AUTO_IMPORT_REVIEW[\s\S]*NAZEM_BULK_IMPORT_REVIEW[\s\S]*تعذر مطابقة%مع المصحف%/);
  assert.match(routes, /String\(error\.code \|\| 'NAZEM_AUTO_IMPORT_REVIEW'\)/);
  assert.match(routes, /String\(error\.code \|\| 'NAZEM_BULK_IMPORT_REVIEW'\)/);
  assert.match(serverIndex, /processAutomaticNazemPlanImports/);
  assert.match(serverIndex, /NAZEM_QURAN_POSITION_UNMATCHED/);
  assert.match(serverIndex, /NAZEM_REVISION_RANGE_UNMATCHED/);
  assert.match(serverIndex, /importReadyNazemPlans\(connection/);
  assert.doesNotMatch(settings, /NazemPlanDiscoveryDialog/);
  assert.doesNotMatch(settings, /label: 'جارٍ الاتصال بناظم'/);
  assert.doesNotMatch(settings, /label: 'تأخر الاتصال بناظم'/);
  assert.doesNotMatch(settings, /credentialErrorCodes/);
  assert.doesNotMatch(settings, /label: 'فشل الاتصال بناظم'/);
  assert.doesNotMatch(settings, /account\.lastError/);
  assert.doesNotMatch(settings, /إعادة التحقق|verify\(account\.teacherId\)/);
  assert.doesNotMatch(settings, /آخر تحقق/);
  assert.doesNotMatch(settings, /مزامنة حسابات المعلمين والطلاب والخطط والتسميع عبر الخادم/);
  assert.doesNotMatch(settings, /NazemSyncLogDialog/);
  assert.match(settings, /NazemErrorsDialog/);
  assert.match(conflictDialog, /resolveRecitationsFromNazem/);
  assert.match(conflictDialog, /اعتماد نتائج ناظم لكل تعارضات التسميع/);
  assert.match(settings, /استيراد/);
  assert.equal((settings.match(/^\s*استيراد\s*$/gm) || []).length, 1);
  assert.doesNotMatch(settings, /آخر مزامنة ناجحة/);
  assert.doesNotMatch(settings, /account\.discoveredPlans/);
  assert.doesNotMatch(settings, /account\.planIssues/);
  assert.match(importDialog, /const controller = new AbortController\(\)/);
  assert.match(settings, /const openImport = \(account\) => setImportTeacher\(account\)/);
  assert.doesNotMatch(settings, /prepareImportData|ProgressBar/);
  assert.match(importDialog, /prepareImportData\(teacher\.teacherId, \{ signal \}\)/);
  assert.match(importDialog, /return \(\) => requestRef\.current\?\.abort\(\)/);
  assert.doesNotMatch(settings, /جاري جلب الطلاب والخطط/);
  assert.doesNotMatch(importDialog, /وجهة الطلاب في مدارج|nazem-import-mode/);
  assert.match(importDialog, /خطة ناظم جاهزة للاستيراد/);
  assert.match(importDialog, /لم تُكتشف خطة/);
  assert.match(importDialog, /استيراد الطلاب ذوي الخطط/);
  assert.doesNotMatch(importDialog, /استيراد جميع الطلاب|submit\('all'\)/);
  assert.match(importDialog, /importMode: 'with_plans'/);
  assert.match(routes, /importMode !== 'with_plans'/);
  assert.match(routes, /req.body.importMode \|\| 'with_plans'/);
  assert.match(routes, /importMode === 'with_plans'/);
  assert.match(routes, /استيراد الطلاب ذوي الخطط يقبل فقط طالبًا لديه خطة ناظم قابلة للاستيراد/);
  assert.match(importDialog, /لدى الطالب أكثر من خطة في ناظم/);
  assert.doesNotMatch(importDialog, /اعتماد استبدال الخطة|requiresPlanReplacementConfirmation|replaceActivePlan/);
  assert.doesNotMatch(routes, /replaceActivePlan|يلزم اعتماد استبدالها يدويًا/);
  assert.match(routes, /accounts\/:teacherId\/issues\/:studentExternalId\/retry/);
  assert.match(settings, /NazemErrorsDialog/);
  assert.doesNotMatch(importDialog, /الخطة تحتاج مراجعة|بلا خطة|لا توجد خطة مكتشفة/);
  assert.doesNotMatch(importDialog, /type="checkbox"/);
  assert.match(importDialog, /onInteractOutside=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(importDialog, /إضافة حلقة \(\{newCommitteeName/);
  assert.match(importDialog, /كل الطلاب والخطط المستوردة مرتبطة مسبقًا[\s\S]*إلغاء/);
  assert.match(importDialog, /createdStudents/);
  assert.match(importDialog, /candidate\.profile\?\.phone/);
  assert.match(importDialog, /candidate\.profile\?\.nationalId/);
  assert.match(importDialog, /تأكيد المطابقة/);
  assert.match(importDialog, /سيُنشأ في المنصة ويُطابق بناظم تلقائيًا/);
  assert.match(importDialog, /موجود ومطابق في المنصة/);
  assert.match(importDialog, /استبعاد من الاستيراد/);
  assert.match(importDialog, /مستبعد من هذه الدفعة فقط/);
  assert.doesNotMatch(importDialog, />مطابقة<|طالب جديد|تخطي/);
  assert.match(importDialog, /NAZEM_PLAN_STUDENT_UNMATCHED/);
  assert.doesNotMatch(importDialog, /refreshImportData|getImportRefreshStatus|جاري جلب أحدث الطلاب والخطط من ناظم/);
  assert.match(integrationApi, /prepareImportData/);
  assert.match(integrationApi, /throwIfAborted\(signal\)/);
  assert.match(integrationApi, /getImportRefreshStatus\(teacherId, started\.jobId, \{ signal \}\)/);
  assert.match(integrationApi, /onProgress\(Number\(latest\.progressPercent \|\| 0\)\)/);
  assert.match(integrationApi, /refreshResult: latest\.result \|\| null/);
  assert.match(service, /updateNazemJobProgress/);
  assert.match(queue, /progress_percent = 100/);
  assert.match(progressMigration, /ADD COLUMN progress_percent/);
  assert.match(progressBar, /<ProgressValue/);
  const progressValue = readFileSync(new URL('../src/components/ui/progress-value.jsx', import.meta.url), 'utf8');
  assert.match(progressValue, /<progress/);
  assert.match(progressValue, /value=\{value\}/);
  assert.match(integrationApi, /latest\.status !== 'synced'/);
  assert.match(integrationApi, /تعذر جلب الطلاب والخطط كاملة من ناظم/);
  assert.match(integrationApi, /Promise\.all\(\[[\s\S]*getImportPreview\(teacherId, '', \{ signal \}\)[\s\S]*getConflicts\(teacherId, \{ signal \}\)/);
  assert.match(importDialog, /useState\(prepared\?\.preview \|\| null\)/);
  assert.match(importDialog, /NazemPlanRefreshSummary/);
  assert.match(refreshSummary, /تغييرات الخطط بعد التحديث/);
  assert.match(refreshSummary, /change\.studentName/);
  assert.match(refreshSummary, /تم فحص الخطط المرتبطة ولم يُكتشف أي تغيير/);
  assert.match(routes, /last_error_code AS lastErrorCode/);
  assert.match(routes, /findUniqueArabicPersonNameMatch\([\s\S]*candidate\.nazemStudentName/);
  assert.match(service, /findUniqueArabicPersonNameMatch\(localStudents, remote\.name\)/);
  assert.doesNotMatch(service, /ranked\.length !== 1/);
  assert.match(routes, /profile\.nationalId && profile\.nationalId === student\.nationalId/);
  assert.doesNotMatch(routes, /selection\.action === 'skip'|\['create', 'match', 'keep', 'skip'\]/);
  assert.match(routes, /INSERT INTO nazem_student_links/);
  assert.match(importDialog, /NazemConflictCard/);
  assert.match(importDialog, /getConflicts\(teacher\.teacherId, \{ signal \}\)/);
});

test('Nazem reconciliation applies its plan as the authoritative source', () => {
  const service = readFileSync(
    new URL('../server/integrations/nazem/service.js', import.meta.url),
    'utf8',
  );
  const worker = readFileSync(
    new URL('../server/workers/nazemSyncWorker.js', import.meta.url),
    'utf8',
  );
  const queue = readFileSync(
    new URL('../server/integrations/nazem/queue.js', import.meta.url),
    'utf8',
  );
  assert.match(service, /if \(remoteChanged \|\| localChanged\) \{[\s\S]*applyRemotePlanToRuwasi/);
  assert.match(service, /if \(remoteChanged \|\| localChanged\) \{[\s\S]*INSERT INTO nazem_sync_conflicts/);
  assert.match(service, /applyRemotePlanToRuwasi/);
  assert.match(service, /dailyPages, Math\.max\(0, Number\(primary\.linkCount \?\? 10\)\)/);
  assert.match(service, /nazem_applied_automatically/);
  assert.match(service, /NAZEM_REMOTE_DAILY_RANGE_UNMATCHED/);
  assert.match(service, /String\(remotePlan\.student\?\.externalId/);
  assert.match(worker, /NAZEM_WORKER_POLL_MS \|\| 1_000/);
  assert.match(worker, /NAZEM_WORKER_CONCURRENCY \|\| 3/);
  assert.match(worker, /Math\.min\(4, Math\.max/);
  assert.match(worker, /Promise\.all\(Array\.from\(\{ length: WORKER_CONCURRENCY \}/);
  assert.match(worker, /recoverExpiredNazemJobs\(connection\)/);
  assert.doesNotMatch(queue, /export async function claimNextNazemJob[\s\S]*UPDATE nazem_sync_jobs SET[\s\S]*NAZEM_LEASE_EXPIRED/);
  assert.doesNotMatch(worker, /NAZEM_RECONCILIATION_MINUTES|enqueueReconciliationJobs/);
  assert.match(worker, /NAZEM_WORKER_POLL_MS \|\| 1_000/);
  assert.doesNotMatch(queue, /enqueueImmediateNazemReconciliation/);
});

test('Nazem recitation keeps authenticated sessions and imported plans immediately usable', () => {
  const service = readFileSync(
    new URL('../server/integrations/nazem/service.js', import.meta.url),
    'utf8',
  );
  const adapter = readFileSync(
    new URL('../server/integrations/nazem/adapter.js', import.meta.url),
    'utf8',
  );
  const queue = readFileSync(
    new URL('../server/integrations/nazem/queue.js', import.meta.url),
    'utf8',
  );
  const routes = readFileSync(
    new URL('../server/routes/nazemIntegrationRoutes.js', import.meta.url),
    'utf8',
  );

  assert.match(service, /async function persistNazemSession/);
  assert.match(service, /await adapter\.login\(\);\s+await persistNazemSession\(connection, job\.teacherId, adapter\);/);
  assert.match(service, /discovery_status = 'imported'/);
  assert.match(service, /NAZEM_IMPORTED_PLAN_AUTHORITATIVE/);
  assert.match(service, /daily\.remote_snapshot AS remoteSnapshot/);
  assert.match(service, /scheduledToAyah: Number\(remoteSource\.verse_to\)/);
  assert.match(adapter, /retryAuthentication && this\.page\.url\(\)\.includes\('\/login'\)/);
  assert.match(adapter, /NAZEM_LATE_COMPLETION_UNVERIFIED/);
  assert.match(adapter, /this\.login\(\{ forceFresh: true \}\)/);
  assert.match(adapter, /absoluteResponsePath\.startsWith\(`\$\{followUpApiBasePath\}\//);
  assert.match(adapter, /absoluteResponsePath\.slice\(followUpApiBasePath\.length\)/);
  assert.match(queue, /WHERE status = 'retrying' AND attempt_count >= max_attempts/);
  assert.match(routes, /student\.external_circle_name AS circleName/);
  assert.doesNotMatch(routes, /student\.circle_name AS circleName/);
});

test('account verification failures leave a retryable account visible to polling', async () => {
  const calls = [];
  const connection = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return [{ affectedRows: 1 }];
    },
  };
  await applyNazemEntityFailure(connection, {
    entityType: 'account',
    operationType: 'account.verify',
    teacherId: 42,
  }, { code: 'NAZEM_OPERATION_TIMEOUT', message: 'timeout' }, 'retrying');
  assert.match(calls[0].sql, /UPDATE nazem_accounts SET status = \?/);
  assert.deepEqual(calls[0].params, ['retrying', 'NAZEM_OPERATION_TIMEOUT', 'timeout', 42]);
});

test('Nazem-imported recitation scores remain whole numbers', () => {
  const service = readFileSync(new URL('../server/integrations/nazem/service.js', import.meta.url), 'utf8');

  assert.match(service, /const rawScore = calculateRecitationScore\(policy, evaluatedFaces, 0, mistakes\)/);
  assert.match(service, /Math\.min\(passingScore - 1, rawScore\)/);
  assert.doesNotMatch(service, /passingScore - 0\.01/);
});
