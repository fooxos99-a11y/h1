import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const sliceBetween = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end));

test('application startup always mounts and replaces indefinite loading with retry', async () => {
  const [main, loading, requests, timeoutHelper, portal, dashboard, errorBoundary, errorState] = await Promise.all([
    read('../src/main.jsx'),
    read('../src/components/LoadingScreen.jsx'),
    read('../src/services/studentsApi.js'),
    read('../src/lib/requestTimeout.js'),
    read('../src/pages/AccountPortal.jsx'),
    read('../src/pages/WajehDashboard.jsx'),
    read('../src/components/AppErrorBoundary.jsx'),
    read('../src/components/ui/error-state.jsx'),
  ]);

  assert.match(main, /mountApp\(\);\s*scheduleServiceWorkerSetup\(\);/);
  assert.match(main, /requestIdleCallback\(runServiceWorkerSetup/);
  assert.doesNotMatch(main, /hardBootTimeout|preloadSiteBrandAssets/);
  assert.match(main, /revealTimeout = window\.setTimeout/);
  assert.match(loading, /timeoutMs = 15_000/);
  assert.match(loading, /تعذر إكمال التحميل/);
  assert.match(requests, /prepareTimedRequest\(requestOptions\)/);
  assert.match(timeoutHelper, /controller\.abort\(\)/);
  assert.match(timeoutHelper, /استغرق الاتصال وقتًا أطول من المتوقع/);
  assert.match(portal, /const \[isLoading, setIsLoading\] = useState\(false\)/);
  assert.match(dashboard, /const \[isDashboardLoading, setIsDashboardLoading\] = useState\(true\)/);
  assert.match(errorBoundary, /message="تعذر فتح الصفحة"/);
  assert.match(errorBoundary, /retryLabel="تحديث"/);
  assert.match(errorState, /retryLabel = 'إعادة المحاولة'/);
});

test('Nazem stays authoritative in live reports while historical source remains visible', async () => {
  const [server, overview, executionFollowup] = await Promise.all([
    read('../server/index.js'),
    read('../src/components/dashboard/ReportsOverview.jsx'),
    read('../src/components/dashboard/ExecutionFollowupSection.jsx'),
  ]);
  const execution = sliceBetween(server, "app.get('/api/execution-followup'", "app.get('/api/families'");
  const progress = sliceBetween(server, 'async function buildProgressReport', 'function resolvePdfFontPair');

  assert.match(execution, /isStudentPlanManagedByNazem\(connection, student\.id\)\) continue/);
  assert.match(execution, /managedSetting\.setting_key = 'nazemIntegrationEnabled'/);
  assert.match(execution, /actual_repeat_count AS actualRepeatCount/);
  assert.match(execution, /actual_listening_count AS actualListeningCount/);
  assert.match(execution, /row\.nazemSource \? 'ayah' : settings\.quranReferenceMode/);
  assert.match(progress, /if \(student\.nazemManaged\) continue/);
  assert.match(progress, /normalizeTaskRow\(task, 'ayah'\)/);
  assert.match(progress, /const planProgress = activePlan && !student\.nazemManaged/);
  assert.doesNotMatch(overview, /!data\?\.period\?\.nazemEnabled/);
  assert.match(executionFollowup, /<SelectItem value="extra">زيادة خارج الخطة<\/SelectItem>/);
  assert.doesNotMatch(executionFollowup, /data\?\.nazemEnabled && filters\.status === 'extra'/);
});

test('remote Nazem follow-up imports repetition and listening into Ruwasi', async () => {
  const service = await read('../server/integrations/nazem/service.js');
  const saveRemote = sliceBetween(service, 'async function saveRemoteFollowUp', 'const NAZEM_ATTENDANCE_TO_RUWASI');

  assert.match(saveRemote, /day\.repetition/);
  assert.match(saveRemote, /Number\(day\.hearing\) === 1/);
  assert.match(saveRemote, /actual_repeat_count = \?, actual_listening_count = \?/);
  assert.match(saveRemote, /task_type = 'repeat'/);
  assert.match(saveRemote, /repeatCount: importedRepeatCount/);
  assert.match(saveRemote, /listeningCount: importedListeningCount/);
});

test('saved Quran report exposes the complete merged memorization only', async () => {
  const [reports, saved, server] = await Promise.all([
    read('../src/components/dashboard/ReportsSection.jsx'),
    read('../src/components/dashboard/ReportsStudentSaved.jsx'),
    read('../server/index.js'),
  ]);

  assert.match(reports, /SelectItem value="studentSaved">محفوظ الطلاب/);
  assert.match(reports, /getStudentSavedReport/);
  assert.match(reports, /exportStudentSavedReport/);
  assert.match(saved, /row\.memorizationRange/);
  assert.doesNotMatch(saved, /row\.masteryRange|row\.reviewRange|بيانات ناظم/);
  assert.match(server, /await getStudentMemorizedRanges\(connection, student\.id\)/);
  assert.match(server, /mode: 'allTime'/);
});
