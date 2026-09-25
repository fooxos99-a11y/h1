import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('execution reminder exclusions are persisted and skipped by the automatic sender', async () => {
  const [server, settings] = await Promise.all([
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    Promise.all(['SettingsSection.jsx', 'NotificationSettings.jsx'].map(name => readFile(new URL('../src/components/dashboard/' + name, import.meta.url), 'utf8'))).then(parts => parts.join('\n')),
  ]);

  assert.match(server, /executionReminderExcludedStudentIds: normalizePositiveIdList/);
  assert.match(server, /VALUES \('executionReminderExcludedStudentIds', \?\)/);
  assert.match(server, /excludedStudentIds\.has\(Number\(row\.studentId\)\)/);
  assert.match(server, /\/api\/settings\/execution-reminder-students/);
  assert.match(settings, /<Label>استثناء طلاب<\/Label>/);
  assert.match(settings, /toggleListValue\('executionReminderExcludedStudentIds', studentId\)/);
  assert.match(settings, /settings\.memorizationExecutionSource/);
});

test('management can correct prior student execution while preserving later progress', async () => {
  const [server, api, section] = await Promise.all([
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/studentsApi.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/StudentExecutionCorrectionsSection.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(server, /app\.get\('\/api\/quran-execution-corrections\/students'/);
  assert.match(server, /app\.get\('\/api\/quran-execution-corrections'/);
  assert.match(server, /date >= today/);
  assert.match(server, /administrativeCorrection/);
  assert.match(server, /student_execution_corrected/);
  assert.match(server, /invalidatePendingTasksAfterExecutionCorrection/);
  assert.match(server, /recomputePlanMemorizationCursor/);
  const acceptance = server.slice(server.indexOf('function acceptedMemorizationSql('), server.indexOf('async function normalizePriorMemorizationRanges(')).replaceAll('${prefix}', '');
  assert.match(acceptance, /teacher_completed = 1[\s\S]*teacher_completed IS NULL\s+AND student_status = 'done'/);
  assert.match(server, /const next = await getNextUnmemorizedPlanPosition\(connection, plan\)/);
  assert.match(api, /administrativeCorrection: true/);
  assert.match(section, />تصحيح تنفيذ الطلاب<\/h/);
  assert.match(section, /max=\{yesterday\}/);
  assert.match(section, /grid-cols-\[minmax\(0,1fr\)_8\.75rem\]/);
  assert.match(section, /className="h-10 min-w-0 px-2 text-xs/);
  assert.match(section, /\[&>span\]:truncate/);
  assert.match(section, /taskIds: task\.taskIds/);
  assert.match(section, /RepeatCountSelector/);
});

test('correction page is hidden unless student execution is enabled', async () => {
  const [dashboard, routes] = await Promise.all([
    readFile(new URL('../src/pages/WajehDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/sectionRoutes.js', import.meta.url), 'utf8'),
  ]);

  assert.match(dashboard, /key: 'studentExecutionCorrections'[\s\S]*label: 'تصحيح تنفيذ الطلاب'[\s\S]*permissionKey: 'studentPlans'/);
  assert.match(dashboard, /section\.key === 'studentExecutionCorrections' && settings\.hasStudentQuranExecution === false/);
  assert.match(dashboard, /case 'studentExecutionCorrections':[\s\S]*<StudentExecutionCorrectionsSection/);
  assert.match(routes, /\['studentExecutionCorrections', 'student-execution-corrections'\]/);
});
