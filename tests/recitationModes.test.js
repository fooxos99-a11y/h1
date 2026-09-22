import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('each teacher controls recitation modes from their own account while tests remain managed centrally', async () => {
  const [catalog, settings, server, preferences, preferencesRoute, migration, dashboard, portal, api] = await Promise.all([
    read('../shared/platform-settings-catalog.js'),
    read('../src/components/dashboard/SettingsSection.jsx'),
    read('../server/index.js'),
    read('../src/components/portal/RecitationSessionSettings.jsx'),
    read('../server/routes/staffRecitationPreferencesRoutes.js'),
    read('../server/migrations/2026.08.30.1-staff-recitation-preferences.js'),
    read('../src/pages/WajehDashboard.jsx'),
    read('../src/pages/AccountPortal.jsx'),
    read('../src/services/studentsApi.js'),
  ]);
  const staffLegacyKeys = [
    'teacherMemorizationRecitationMode',
    'teacherReviewRecitationMode',
    'teacherLinkRecitationMode',
    'reciterMemorizationRecitationMode',
    'reciterReviewRecitationMode',
    'reciterLinkRecitationMode',
  ];
  for (const key of staffLegacyKeys) {
    assert.doesNotMatch(catalog, new RegExp(key));
    assert.doesNotMatch(settings, new RegExp(key));
    assert.match(server, new RegExp(key));
  }
  assert.doesNotMatch(catalog, /quranTestRecitationMode/);
  assert.doesNotMatch(catalog, /narrationRecitationMode/);
  assert.doesNotMatch(settings, /طريقة تسميع الاختبارات|طريقة تسميع يوم السرد/);
  assert.doesNotMatch(catalog, /recitationMode\('masteryRecitationMode'/);
  assert.doesNotMatch(settings, /masteryRecitationMode/);
  assert.match(server, /preferences\?\.\[`\$\{type\}Mode`\]/);
  assert.match(server, /loadStaffRecitationPreferences\([\s\S]*supervisorId[\s\S]*req\.auth\.role/);
  assert.match(server, /getRecitationEvaluationMode\([\s\S]*recitationPreferences/);
  assert.match(server, /memorizationRecitationMode: teacherMemorizationRecitationMode/);
  assert.match(server, /masteryRecitationMode: teacherMemorizationRecitationMode/);
  assert.doesNotMatch(server, /req\.body\.teacherMemorizationRecitationMode/);
  assert.doesNotMatch(server, /req\.body\.reciterMemorizationRecitationMode/);
  assert.match(server, /requestedEvaluationMode !== evaluationMode/);
  assert.match(server, /هذا التسميع مضبوط على العدّ فقط/);
  assert.match(server, /تحديد أخطاء المصحف غير صحيح/);
  assert.match(preferences, /memorizationMode[\s\S]*masteryMode[\s\S]*reviewMode[\s\S]*linkMode/);
  assert.match(preferences, /<SelectItem value="mushaf">المصحف<\/SelectItem>/);
  assert.match(preferences, /<SelectItem value="count">العد<\/SelectItem>/);
  assert.match(preferences, /void save\(\{ \.\.\.preferences, \[key\]: value \}\)/);
  assert.match(preferences, /حُفظ تلقائيًا/);
  assert.doesNotMatch(preferences, /isSaving \? 'جاري الحفظ…' : 'حفظ'/);
  assert.match(preferences, /\[font-family:var\(--font-ui\)\]/);
  assert.match(preferences, /grid grid-cols-1 gap-4/);
  assert.match(preferencesRoute, /req\.auth\.id/);
  assert.doesNotMatch(preferencesRoute, /req\.params/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS staff_recitation_preferences/);
  assert.match(migration, /staff\.role IN \('supervisor', 'reciter'\)/);
  assert.match(api, /getMyRecitationPreferences/);
  assert.match(api, /updateMyRecitationPreferences/);
  assert.match(dashboard, /visibleActiveSection === 'quranEvaluation'[\s\S]*<RecitationSettingsButton/);
  assert.doesNotMatch(dashboard, /key: 'recitationSessionSettings'/);
  assert.match(portal, /activeSection === 'quranEvaluation'[\s\S]*<RecitationSettingsButton/);
  assert.doesNotMatch(portal, /key: 'recitationSessionSettings'/);
  assert.doesNotMatch(preferences, /label: 'الإتقان'/);
});

test('count-only evaluation is shared while detailed tests and narration use the Mushaf', async () => {
  const [countDialog, teacher, tests, narration, api] = await Promise.all([
    read('../src/components/portal/CountOnlyEvaluationDialog.jsx'),
    read('../src/components/portal/TeacherEvaluationDialog.jsx'),
    read('../src/components/dashboard/QuranTestsSection.jsx'),
    read('../src/components/dashboard/NarrationStudentPanel.jsx'),
    read('../src/services/studentsApi.js'),
  ]);
  assert.match(countDialog, /عدد التنبيهات/);
  assert.match(countDialog, /عدد الأخطاء/);
  assert.match(teacher, /evaluationModes/);
  assert.match(teacher, /evaluationMode: 'count'/);
  assert.doesNotMatch(teacher, /تعمل الآن دون إنترنت/);
  assert.doesNotMatch(tests, /quranTestRecitationMode/);
  assert.match(tests, /MushafRecitationDialog/);
  assert.match(tests, /مقطع عشوائي/);
  assert.match(tests, />النتيجة</);
  assert.doesNotMatch(narration, /recitationMode === 'count'/);
  assert.match(narration, /بدء التسميع/);
  assert.match(narration, />النتيجة</);
  assert.match(narration, /MushafRecitationDialog/);
  assert.match(api, /getQuranTestJuzAyahs/);
  assert.match(api, /getNarrationPartAyahs/);
});

test('attendance points and repetition controls respect their execution actor and saved settings', async () => {
  const [catalog, settings, countPointsField, teacher, taskList, repeatSelector, listeningChoice, endSelector, server, nazemService, database] = await Promise.all([
    read('../shared/platform-settings-catalog.js'),
    read('../src/components/dashboard/SettingsSection.jsx'),
    read('../src/components/dashboard/CountPointsSettingField.jsx'),
    read('../src/components/portal/TeacherEvaluationDialog.jsx'),
    read('../src/components/portal/TeacherRecitationTaskList.jsx'),
    read('../src/components/portal/RepeatCountSelector.jsx'),
    read('../src/components/portal/ListeningChoice.jsx'),
    read('../src/components/portal/RecitationEndSelector.jsx'),
    read('../server/index.js'),
    read('../server/integrations/nazem/service.js'),
    read('../server/db.js'),
  ]);
  assert.match(settings, /label=\{rewardUnits\.text\('كيلومترات الحضور'\)\}[\s\S]*settingKey="attendancePoints"/);
  assert.match(settings, /label=\{rewardUnits\.text\('كيلومترات التأخير'\)\}[\s\S]*settingKey="manualLateAttendancePoints"/);
  assert.match(taskList, /label: 'حفظ'[\s\S]*label: 'مراجعة'[\s\S]*label: 'ربط'[\s\S]*label: 'إتقان'/);
  assert.match(taskList, /recitation-actions/);
  assert.doesNotMatch(taskList, /NazemSyncStatusBadge|task\.nazemSyncStatus|task\.nazemSyncError/);
  assert.doesNotMatch(taskList, /nazemSyncStatusLabel|بانتظار المزامنة/);
  assert.match(taskList, /حُفظت النتيجة/);
  assert.match(taskList, /عدد تكرارات حفظ/);
  assert.match(taskList, /RepeatCountSelector/);
  assert.match(repeatSelector, /justify-start/);
  assert.match(taskList, /tasks: action\.tasks/);
  assert.match(teacher, /task\.taskType === 'memorization'[\s\S]*repeatCount: selectedStudent\.repeatCount/);
  assert.match(teacher, /allowRepeatCountEditing=\{Boolean\(data\?\.allowRepeatCountEditing\)\}/);
  assert.match(teacher, /executionSources=\{data\?\.executionSources\}/);
  assert.doesNotMatch(settings, /تنفيذ التكرار والسماع عن طريق/);
  assert.doesNotMatch(catalog, /select\('repeatExecutionSource'/);
  assert.match(settings, /label="السماح للطالب بتعديل عدد التكرارات"/);
  assert.match(settings, /label="السماح للطالب بتعديل عدد مرات السماع"/);
  assert.doesNotMatch(catalog, /toggle\('allowRepeatCountEditing'/);
  assert.match(database, /\('allowRepeatCountEditing', 'false'\)/);
  assert.match(repeatSelector, /label = 'تكرار'/);
  assert.match(repeatSelector, /if \(compact\) \{\s*return `\$\{label\}: \$\{selected\}`;/);
  assert.doesNotMatch(repeatSelector, /\$\{label\} \(\$\{selected\}\)/);
  assert.match(taskList, /ariaLabel=\{`عدد تكرارات حفظ/);
  assert.match(taskList, /TeacherRecitationPractice/);
  assert.match(taskList, /compact/);
  assert.match(repeatSelector, /countSuffix/);
  assert.match(settings, /listeningKey: 'memorizationListeningCount'/);
  assert.match(settings, /listeningKey: 'masteryListeningCount'/);
  assert.match(settings, /listeningPointsKey: 'memorizationListeningPointValue'/);
  assert.match(settings, /listeningPointsKey: 'masteryListeningPointValue'/);
  assert.match(settings, /label="عدد مرات السماع"[\s\S]*pointsKey=\{selectedEvaluationType\.listeningPointsKey\}/);
  assert.match(settings, /selectedEvaluationType\.repeatKey && \([\s\S]*settings\.nazemIntegrationEnabled \? \([\s\S]*كيلومترات كل تكرار/);
  assert.match(settings, /selectedEvaluationType\.listeningKey && \([\s\S]*settings\.nazemIntegrationEnabled \? \([\s\S]*كيلومترات السماع عند اختيار نعم/);
  assert.doesNotMatch(settings, /key !== 'repeatExecutionSource'/);
  assert.match(taskList, /if \(nazemManaged\) \{\s*return <ListeningChoice/);
  assert.match(taskList, /nazemManaged \|\| \['teacher', 'both'\]\.includes\(executionSources\?\.repeat/);
  assert.match(taskList, /editable=\{repeatEditable && \(nazemManaged \|\| \(allowRepeatCountEditing/);
  assert.match(taskList, /optionMax=\{nazemManaged \? 30/);
  assert.doesNotMatch(taskList, /اكتمل الإتقان|nazemCompleted|selectedCompletions/);
  assert.match(taskList, /const repeatEditable = teacherExecutionMode[\s\S]*action\.key === 'saved'/);
  assert.match(taskList, /const _resolveDefaultListeningCount = \(\) => \{\s*if \(nazemManaged\) \{\s*return 1;/);
  assert.doesNotMatch(taskList, /key: 'compensation'|label: 'التعويض'|task\.nazemCompensation/);
  assert.doesNotMatch(server, /nazemCompensation:/);
  assert.match(listeningChoice, /value = 1/);
  assert.match(listeningChoice, /label: 'نعم'[\s\S]*label: 'لا'/);
  assert.match(endSelector, /ariaLabel="سورة النهاية"[\s\S]*ariaLabel="آية النهاية"/);
  assert.doesNotMatch(endSelector, /surahs\.length > 1/);
  assert.match(teacher, /listeningCount: selectedStudent\.listeningCount/);
  assert.match(catalog, /number\('memorizationListeningCount', 'عدد مرات سماع الحفظ', 3, 1\)/);
  assert.match(catalog, /number\('masteryListeningCount', 'عدد مرات سماع الإتقان', 3, 1\)/);
  assert.match(database, /\('memorizationListeningCount', '3'\)/);
  assert.match(database, /\('masteryListeningCount', '3'\)/);
  assert.match(countPointsField, /className="min-h-6 px-0\.5 font-normal text-blue-600/);
  assert.match(countPointsField, /<Dialog open=\{open\}/);
  assert.match(countPointsField, /useRewardUnits\(settings\.summitEnabled\)/);
  assert.match(countPointsField, /rewardUnits\.text\(`تعديل كيلومترات كل \$\{unitLabel\}`\)/);
  assert.match(countPointsField, /\{rewardUnits\.short\}\)/);
  assert.match(server, /memorizationRepeatPointValue: Math\.max\(0, Math\.trunc\(Number/);
  assert.match(server, /masteryListeningPointValue: Math\.max\(0, Math\.trunc\(Number/);
  assert.match(server, /allowRepeatCountEditing: settings\.allowRepeatCountEditing === 'true'/);
  assert.match(server, /allowListeningCountEditing: settings\.allowListeningCountEditing === 'true'/);
  assert.doesNotMatch(server, /settings\.allowRepeatCountEditing = true/);
  assert.match(server, /allowRepeatCountEditing: !nazemManaged[\s\S]*settings\.allowRepeatCountEditing[\s\S]*canStudentExecuteQuranTask\(settings, 'memorization'\)/);
  assert.match(server, /allowListeningCountEditing: !nazemManaged[\s\S]*settings\.allowListeningCountEditing[\s\S]*canStudentExecuteQuranTask\(settings, 'memorization'\)/);
  assert.match(server, /const actualRepeatCount = Number\.isFinite\(requestedRepeatCount\)/);
  assert.match(server, /JSON_EXTRACT\(managedLink\.remote_snapshot, '\$\.primary\.repeatCount'\)/);
  assert.match(server, /row\.nazemManaged[\s\S]*\? 1/);
  assert.match(server, /task\.nazemManaged \|\| canTeacherExecuteQuranTask\(settings, 'repeat'\)/);
  assert.match(server, /nazemManaged && \['repeat', 'link'\]\.includes\(first\.taskType\)/);
  assert.match(server, /row\.taskType !== 'repeat' \|\| !nazemManaged/);
  assert.match(server, /نهاية التسميع خارج نطاق ناظم/);
  assert.match(server, /options: candidates[\s\S]*compareQuranPositionInDirection/);
  assert.match(nazemService, /JSON_EXTRACT\(planLink\.remote_snapshot, '\$\.primary\.repeatCount'\)/);
  assert.match(server, /expectedRepeatCount[\s\S]*actual_repeat_count = \?/);
  assert.match(server, /Math\.min\(task\.nazemManaged \? 30 : expectedRepeatCount/);
  assert.match(server, /expectedRepeatCount: task\.nazemManaged[\s\S]*\? 30/);
  assert.match(server, /expectedListeningCount: task\.nazemManaged[\s\S]*\? 1/);
  assert.match(server, /const completed = !notMemorized && task\.nazemManaged[\s\S]*task\.track === 'mastery'[\s\S]*\? true/);
  assert.doesNotMatch(server, /hasNazemMasteryResult|nazemCompleted/);
  assert.match(server, /expectedListeningCount[\s\S]*actual_listening_count = \?/);
});
