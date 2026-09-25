import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('teacher dashboard exposes student plans while keeping other student administration hidden', async () => {
  const [dashboard, accountPortal, evaluationSection, routes] = await Promise.all([
    readFile(new URL('../src/pages/WajehDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AccountPortal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/TeacherEvaluationSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/sectionRoutes.js', import.meta.url), 'utf8'),
  ]);

  assert.match(dashboard, /isSupervisor && \['manualAttendance', 'students'\]\.includes\(section\.key\)/);
  assert.match(dashboard, /isSupervisor && section\.key === 'studentPlans'\) return true/);
  assert.match(dashboard, /const supervisorSectionOrder[\s\S]*\['teacherPoints', 3\][\s\S]*\['reports', 4\][\s\S]*\['studentPlans', Number.POSITIVE_INFINITY\]/);
  assert.match(dashboard, /supervisorSectionOrder\.get\(first\.key\)/);
  assert.match(dashboard, /key: 'previousRecitationSessions'[\s\S]*permissionKey: 'quranEvaluation'/);
  assert.match(dashboard, /<TeacherPreviousSessionsPanel \/>/);
  assert.match(dashboard, /key: 'mushaf', label: 'المصحف'/);
  assert.match(dashboard, /section\.key === 'mushaf'\) return isSupervisor \|\| isReciter/);
  assert.match(accountPortal, /key: 'studentPlans', label: 'خطط الطلاب'/);
  assert.match(accountPortal, /settings\.teacherManualPointsEnabled[\s\S]*key: 'teacherPoints', label: 'الإضافة والخصم'/);
  assert.ok(accountPortal.indexOf("key: 'staffAttendance', label: 'التحضير'") < accountPortal.indexOf("key: 'quranEvaluation', label: 'جلسات التسميع'"));
  assert.match(accountPortal, /case 'studentPlans':[\s\S]*<StudentPlansSection hideCommitteeFilter/);
  assert.match(accountPortal, /key: 'previousRecitationSessions'[\s\S]*key: 'teacherPoints'[\s\S]*key: 'teacherReports'[\s\S]*key: 'calls'[\s\S]*key: 'studentPlans'/);
  assert.match(accountPortal, /const ReportsSection = lazy\(\(\) => import\('@\/components\/dashboard\/ReportsSection'\)\);/);
  assert.match(accountPortal, /case 'teacherReports':[\s\S]*?<ReportsSection[\s\S]*?teacherScoped[\s\S]*?canViewStandardReports[\s\S]*?canViewExecutionFollowup=\{settings\.hasStudentQuranExecution !== false\}/);
  assert.doesNotMatch(accountPortal, /TeacherReportsSection/);
  assert.match(evaluationSection, /<TeacherEvaluationDialog supervisorId=\{supervisorId\} inline \/>/);
  assert.doesNotMatch(evaluationSection, /فتح التقييم|useState/);
  assert.match(routes, /\['previousRecitationSessions', 'previous-recitation-sessions'\]/);
  const portalRoutes = routes.slice(routes.indexOf('export const portalSectionRoutes'));
  assert.match(portalRoutes, /\['studentPlans', 'student-plans'\]/);
});

test('teacher attendance and reports are constrained to linked committees on the server', async () => {
  const [server, attendance, reports, teacherOverview] = await Promise.all([
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/ManualAttendanceSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/ReportsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/ReportsOverview.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(server, /يمكنك تحضير طلاب حلقاتك فقط/);
  assert.match(server, /requireManagementReportAccess/);
  assert.match(server, /sc\.supervisor_id = \? AND sc\.committee_id = s\.committee_id/);
  assert.doesNotMatch(attendance, /طلاب حلقاتي|getMyCommittees/);
  assert.match(attendance, /teacherScoped \? \([\s\S]*headerLabel/);
  assert.doesNotMatch(reports, /getMyCommittees/);
  assert.match(reports, /teacherScoped \? Promise\.resolve\(\[\]\)/);
  assert.match(reports, /<DashboardHeaderFilters aboveTitle>[\s\S]*<DashboardDateRange/);
  assert.ok(reports.indexOf('<DashboardMobileHeaderActions>') < reports.indexOf('<Card className='));
  assert.match(reports, /!isExecutionFollowup && !isArchiveReport && \(teacherScoped \|\| isRangeReport\)[\s\S]*DashboardDateRange/);
  assert.match(reports, /teacherScoped[\s\S]*studentsApi\.getProgressReport/);
  assert.match(reports, /<ReportsOverview data=\{overview\} \/>/);
  assert.match(teacherOverview, /CommitteeIndicatorsPanel/);
  assert.match(teacherOverview, /QuranAchievementDropdown/);
  assert.match(teacherOverview, /إجمالي أوجه الحفظ/);
  assert.match(teacherOverview, /إجمالي أوجه المراجعة/);
  assert.match(teacherOverview, /إجمالي أوجه الربط/);
});

test('teacher reports expose execution only for student execution mode and keep scoped report controls', async () => {
  const [dashboard, accountPortal, execution, reports, server] = await Promise.all([
    readFile(new URL('../src/pages/WajehDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AccountPortal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/ExecutionFollowupSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/ReportsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(dashboard, /key: 'executionFollowup'.*label: 'متابعة التنفيذ'/);
  assert.match(dashboard, /isSupervisor && \['teacherPoints', 'culturalCompetition', 'calls', 'reports'\]\.includes\(section\.key\)\) return true/);
  assert.match(dashboard, /canViewStandardReports=\{isSupervisor \|\|/);
  assert.match(dashboard, /canViewExecutionFollowup=\{[\s\S]*settings\.hasStudentQuranExecution !== false[\s\S]*isSupervisor \|\| isManager/);
  assert.match(accountPortal, /teacherScoped[\s\S]*canViewStandardReports[\s\S]*canViewExecutionFollowup=\{settings\.hasStudentQuranExecution !== false\}/);
  assert.match(reports, /value="executionFollowup">متابعة تنفيذ/);
  assert.match(reports, /value="students">طلاب/);
  assert.match(reports, /value="overview">إحصائيات/);
  assert.match(reports, /!isExecutionFollowup && \(isOverviewReport[\s\S]*aria-label="الحلقة"/);
  assert.doesNotMatch(reports, /aria-label="الطالب"/);
  assert.match(reports, /<ExecutionFollowupSection teacherScoped=\{teacherScoped\} \/>/);
  assert.match(execution, /teacherScoped \? 'all' : filters\.committeeId/);
  assert.match(execution, /\{!teacherScoped && \(/);
  assert.match(server, /function requireExecutionFollowupOrOwnCommittee/);
  assert.match(server, /const supervisorExecutionFollowup = req\.auth\.role === 'supervisor'[\s\S]*path === '\/execution-followup'/);
  assert.match(server, /supervisorOwnReports \|\| supervisorExecutionFollowup \|\| supervisorTeacherPointsAccess \|\| supervisorTeacherPointsReport \|\| accountCallsAccess/);
  assert.match(server, /app\.get\('\/api\/execution-followup', requireExecutionFollowupOrOwnCommittee/);
  assert.doesNotMatch(server, /متابعة التنفيذ متاحة للمعلم عندما ينفذ الطالب مهامه فقط/);
  assert.match(server, /sc\.supervisor_id = \? AND sc\.committee_id = s\.committee_id/);
});

test('attendance source does not override the independent Quran execution sources', async () => {
  const [dashboard, settings, server] = await Promise.all([
    readFile(new URL('../src/pages/WajehDashboard.jsx', import.meta.url), 'utf8'),
    Promise.all(['SettingsSection.jsx', 'NotificationSettings.jsx'].map(name => readFile(new URL('../src/components/dashboard/' + name, import.meta.url), 'utf8'))).then(parts => parts.join('\n')),
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
  ]);

  assert.match(settings, /recitationAttendanceSource: value,[\s\S]*attendanceManualEnabled: value !== 'teacher'/);
  assert.match(server, /!settings\.attendanceManualEnabled[\s\S]*!settings\.attendanceAccountEnabled[\s\S]*settings\.recitationAttendanceSource !== 'teacher'/);
  assert.doesNotMatch(server, /settings\.recitationAttendanceSource === 'teacher'[\s\S]*settings\.quranTaskExecutionSource = 'teacher'/);
  assert.doesNotMatch(dashboard, /بناءً على المعلم/);
});

test('teacher reports use a date range and call rooms lock to the linked committee', async () => {
  const [reports, reportsProgress, server, calls, callRoutes] = await Promise.all([
    readFile(new URL('../src/components/dashboard/ReportsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/ReportsProgress.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/calls/CallsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../server/routes/callRoutes.js', import.meta.url), 'utf8'),
  ]);

  assert.match(reports, /const reportFromDate = progressFromDate/);
  assert.match(reportsProgress, /<HeaderCell>الحضور<\/HeaderCell>/);
  assert.match(reportsProgress, /<HeaderCell>المراجعة<\/HeaderCell>/);
  assert.match(reportsProgress, /<HeaderCell>الربط<\/HeaderCell>/);
  assert.match(reportsProgress, /<HeaderCell>نسبة الإنجاز<\/HeaderCell>/);
  assert.match(reportsProgress, /label="مقدار الحفظ"/);
  assert.match(reportsProgress, /formatReportFaces/);
  assert.doesNotMatch(reportsProgress, /formatContinuousRecitationRange/);
  assert.doesNotMatch(reportsProgress, /بيانات ناظم|مقدار الفترة/);
  assert.match(server, /quranReferenceMode: settings\.quranReferenceMode === 'page' \? 'page' : 'ayah'/);
  assert.doesNotMatch(reportsProgress, /<HeaderCell>التحضير<\/HeaderCell>|محفوظ اليوم|مراجعة اليوم|<HeaderCell>النسبة<\/HeaderCell>/);
  assert.match(reportsProgress, /التكرار:/);
  assert.match(reportsProgress, /السماع:/);
  assert.match(server, /const progressScoredTaskTypes = \['memorization', 'review', 'link'\]/);
  assert.match(server, /progressScoredTaskTypes\.map\(\(type\) => tasks\[type\]\.percentage\)/);
  assert.match(reports, /const reportToDate = toDate/);
  const dateRange = await readFile(new URL('../src/components/dashboard/DashboardDateRange.jsx', import.meta.url), 'utf8');
  assert.match(reports, /onFromChange=\{updateFromDate\} onToChange=\{updateToDate\}/);
  assert.match(dateRange, /ariaLabel="التاريخ من"/);
  assert.match(dateRange, /ariaLabel="التاريخ إلى"/);
  assert.doesNotMatch(reports, /teacherScoped \? date : progressFromDate/);
  assert.match(calls, /committeeSelectionLocked \? \{ name: form\.name \} : form/);
  assert.match(calls, /\{!committeeSelectionLocked && committees\.length > 0 && <div/);
  assert.match(calls, /committeeSelectionLocked && committees\.length === 0/);
  assert.match(callRoutes, /r\.committee_id IS NULL/);
  assert.match(callRoutes, /COALESCE\(c\.name, 'غرفة عامة'\)/);
  assert.match(callRoutes, /committeeSelectionLocked: req\.auth\?\.role === 'supervisor'/);
  assert.match(callRoutes, /req\.auth\?\.role === 'supervisor'[\s\S]*supervisorCommittees\[0\]\?\.id/);
});

test('mushaf fonts use packaged offline assets and keep a readable fallback', async () => {
  const [fonts, page] = await Promise.all([
    readFile(new URL('../src/lib/quranFonts.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/MadaniMushafPage.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(fonts, /resolveAssetUrl\('quran\/hafs\/fonts\/uthmanic-hafs\.woff2'\)/);
  assert.match(fonts, /resolveAssetUrl\(`quran\/hafs\/fonts\/p\$\{page\}\.woff2`\)/);
  assert.match(fonts, /Promise\.allSettled/);
  assert.doesNotMatch(fonts, /getApiBase|\/api\/quran-fonts/);
  assert.doesNotMatch(page, /fontReady \? 'visible' : 'invisible'/);
});

test('teacher recitation attendance reveals grouped actions without a page reload', async () => {
  const [dashboard, evaluation, taskList, recitationAction, recitationDetails, amountVisibility, amountToggle, endSelector, inlineSelect, server, deploymentEnv] = await Promise.all([
    readFile(new URL('../src/pages/WajehDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/TeacherEvaluationDialog.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/TeacherRecitationTaskList.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/TeacherRecitationAction.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/TeacherRecitationDetails.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/RecitationAmountVisibility.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/RecitationAmountsToggle.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/RecitationEndSelector.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/InlineRecitationSelect.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../.env.madarij', import.meta.url), 'utf8'),
  ]);

  assert.match(dashboard, /\['manualAttendance', 'students'\]/);
  assert.match(dashboard, /!isSupervisor && section\.key === 'manualAttendance'/);
  // Attendance may wait for imported daily amounts without starting plan discovery.
  assert.doesNotMatch(evaluation, /refreshNazem/);
  assert.match(evaluation, /data\?\.nazemRefreshPending/);
  assert.match(evaluation, /teacherAttendanceMode/);
  assert.match(taskList, /placeholder="اختر الحالة"/);
  assert.match(taskList, /label: 'حفظ'/);
  assert.match(taskList, /label: 'مراجعة'/);
  assert.match(taskList, /label: 'ربط'/);
  assert.match(taskList, /label: 'إتقان'/);
  assert.doesNotMatch(taskList, /اكتمل الإتقان|nazemCompleted|selectedCompletions/);
  assert.match(taskList, /textClassName="whitespace-nowrap break-normal"/);
  assert.match(taskList, /recitation-actions/);
  assert.match(taskList, /<RecitationIdentity name=\{student.studentName\}/);
  assert.match(taskList, /recitation-reference-card/);
  assert.match(taskList, /RecitationAmountVisibility/);
  assert.match(taskList, /TeacherRecitationAction/);
  assert.match(evaluation, /\[showAmounts, setShowAmounts\] = useState\(false\)/);
  assert.doesNotMatch(evaluation, /OfflineRecitationStatus/);
  assert.match(evaluation, /RecitationAmountsToggle/);
  assert.match(evaluation, /DashboardMobileHeaderActions/);
  assert.doesNotMatch(evaluation, /<h2[^>]*>جلسات التسميع<\/h2>/);
  assert.match(amountToggle, /إخفاء جميع المقادير/);
  assert.match(taskList, /visible=\{showAmounts\}/);
  assert.match(taskList, /showAmount=\{showAmounts && !isNazemLinkTask\(action\.tasks\[0\]\)\}/);
  assert.doesNotMatch(taskList, /showAmount=\{showAmounts \|\| nazemManaged\}/);
  assert.match(recitationAction, /showAmount && <TeacherRecitationDetails/);
  assert.match(recitationAction, /data-recitation-slot/);
  assert.match(recitationDetails, /className="recitation-amount" dir="rtl"/);
  assert.match(recitationDetails, /maxLines=\{2\}/);
  assert.match(taskList, /const repeatEditable = teacherExecutionMode[\s\S]*executionSources\?\.repeat[\s\S]*action\.key === 'saved'/);
  assert.doesNotMatch(taskList, /showAmounts \|\| nazemManaged/);
  assert.match(taskList, /showAmounts && firstTask\.taskType === 'memorization' && isCompletedGroup/);
  assert.match(taskList, /<TeacherRecitationPractice repeatControl=/);
  assert.match(recitationDetails, /amountControl \|\| <RecitationAmountVisibility/);
  assert.doesNotMatch(taskList, /label: 'التعويض'|key: 'compensation'/);
  assert.match(taskList, /listeningControl=\{memorizationView\?\.listeningControl\}/);
  assert.match(taskList, /actionOrder = \['saved', 'link', 'review', 'mastery'\]/);
  assert.match(taskList, /if \(!action\.tasks\.length\) return false/);
  assert.match(taskList, /\['teacher', 'both'\]\.includes\(executionSources\[action\.sourceKey\]\)/);
  assert.match(taskList, /hasRecitationTasks && canRecite/);
  assert.match(taskList, /attendanceEditable = Boolean\(onAttendanceChange\)/);
  assert.match(taskList, /attendanceControlled = attendanceEditable[\s\S]*student\.canSetAttendance \|\| student\.nazemManaged/);
  assert.match(taskList, /attendanceBlocksRecitation = \['absent', 'excused'\]\.includes/);
  assert.match(taskList, /teacherAttendanceMode && !studentById\.has\(studentId\)/);
  assert.match(taskList, /!attendanceControlled \|\| \['present', 'late'\]\.includes/);
  assert.match(taskList, /\{mistakeCount\} خطأ/);
  assert.match(taskList, /\{warningCount\} تنبيه/);
  assert.doesNotMatch(taskList, />خطأ \{mistakeCount\}</);
  assert.match(taskList, /\{getQuranTaskLabel\(firstTask\)\}:/);
  assert.match(recitationAction, /className="recitation-action min-w-0 px-2/);
  assert.match(evaluation, /secondaryAction=\{notCompletedAction\}/);
  assert.match(evaluation, /shouldHideStudent = \['absent', 'excused'\]\.includes\(status\)/);
  assert.match(evaluation, /recitationPending: !hasRemainingTasks/);
  assert.doesNotMatch(evaluation, /&& \['present', 'late'\]\.includes\(student\.attendanceStatus\)[\s\S]*&& !hasRemainingTasks/);
  assert.doesNotMatch(taskList, /اختر حاضر أو متأخر لفتح مهام التسميع/);
  assert.doesNotMatch(endSelector, /surahs\.length > 1/);
  assert.match(endSelector, /ariaLabel="سورة النهاية"/);
  assert.doesNotMatch(endSelector, /const sameSurah = Number\(start\.surah\)/);
  assert.match(inlineSelect, /!gap-0/);
  assert.match(inlineSelect, /!px-0\.5/);
  assert.match(inlineSelect, /appearance="inline"/);
  assert.doesNotMatch(amountVisibility, /useState|Eye|Button/);
  assert.doesNotMatch(deploymentEnv, /VITE_API_BASE/);
  assert.doesNotMatch(taskList, /student\.committeeName/);
  assert.doesNotMatch(taskList, /bg-background\/70/);
  assert.match(server, /const teacherAttendanceMode = canTeacherSetRecitationAttendance\(settings, req\.auth\.role\)/);
  assert.match(server, /AND t\.task_type IN \('memorization', 'review', 'link'\)/);
  assert.match(server, /if \(Number\(row\.nazemManaged\)\) return true;/);
  assert.match(server, /if \(\['absent', 'excused'\]\.includes\(attendanceStatus\)\) return false;/);
  assert.match(server, /tasks: rows[\s\S]*?isRecitationAttendanceVisible[\s\S]*?taskQueue: allRows/);
  assert.match(server, /if \(!\['present', 'late'\]\.includes\(attendanceStatus\)\) return teacherAttendanceMode;/);
  assert.doesNotMatch(server, /const studentStatusFilter = `AND \(t\.student_status = 'done'/);
  assert.match(server, /attemptCount: Math\.max\(0, Number\(row\.attemptCount \|\| 0\)\)/);
  assert.doesNotMatch(server, /req\.body\.mode === 'recitation_teacher'\s*&&\s*settings\.recitationAttendanceSource/);
});

test('attendance stays unselected until an explicit choice and absence messages follow that choice only', async () => {
  const [server, attendance, settings] = await Promise.all([
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/ManualAttendanceSection.jsx', import.meta.url), 'utf8'),
    Promise.all(['SettingsSection.jsx', 'NotificationSettings.jsx'].map(name => readFile(new URL('../src/components/dashboard/' + name, import.meta.url), 'utf8'))).then(parts => parts.join('\n')),
  ]);

  assert.match(attendance, /value=\{row\.status \|\| ''\}/);
  assert.match(attendance, /<SelectValue placeholder="اختر الحالة"/);
  assert.match(settings, /ariaLabel="الإرسال التلقائي لرسالة الغياب"/);
  assert.match(settings, /label="قالب رسالة الغياب"/);
  assert.match(server, /status === 'absent'[\s\S]*notifyStudentGuardianAbsenceOnce/);
  assert.match(server, /message_type = 'absence'[\s\S]*status = 'sent'/);
  assert.doesNotMatch(server, /processAutomaticAbsenceMessages|تسجيل غياب تلقائي/);
  assert.doesNotMatch(server, /COALESCE\(ar\.status, 'absent'\)/);
  assert.match(server, /processAutomaticExecutionMessages[\s\S]*t\.task_type IN \('memorization', 'review', 'link'\)/);
  assert.match(server, /processAutomaticExecutionMessages[\s\S]*COALESCE\(t\.target_pages, 0\) > 0/);
});
