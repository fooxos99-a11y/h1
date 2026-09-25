import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('reciter login receives only recitation permission and inactive accounts cannot log in', async () => {
  const [authRoutes, permissions, database] = await Promise.all([
    read('../server/routes/tenantAuthRoutes.js'),
    read('../server/services/dashboardPermissions.js'),
    read('../server/db.js'),
  ]);

  assert.match(authRoutes, /WHERE login_number = \? AND is_active = 1/);
  assert.match(authRoutes, /role === 'reciter'[\s\S]*dashboardPermissions: \['quranEvaluation'\]/);
  assert.match(permissions, /if \(role === 'reciter'\) return \['quranEvaluation'\]/);
  assert.match(database, /addColumnIfMissing\('supervisors', 'is_active'/);
  assert.match(database, /auth_sessions'[\s\S]*ENUM\('manager', 'admin', 'supervisor', 'reciter', 'student'\)/);
});

test('reciter management requires linked committees and preserves history through disable', async () => {
  const [server, api, management, reciters, managementIconButton] = await Promise.all([
    read('../server/index.js'),
    read('../src/services/studentsApi.js'),
    read('../src/components/dashboard/CommitteeStaffSection.jsx'),
    read('../src/components/dashboard/RecitersSection.jsx'),
    read('../src/components/ui/management-icon-button.jsx'),
  ]);

  assert.match(server, /app\.post\('\/api\/reciters'[\s\S]*ensureCommitteeIdsExist\(connection, req\.body\.committeeIds\)/);
  assert.match(server, /app\.put\('\/api\/reciters\/:id'[\s\S]*DELETE FROM supervisor_committees[\s\S]*INSERT INTO supervisor_committees/);
  assert.match(server, /app\.patch\('\/api\/reciters\/:id\/active'[\s\S]*revokeAuthSessionsForUser\(connection, 'reciter'/);
  assert.doesNotMatch(server, /app\.delete\('\/api\/reciters/);
  assert.match(api, /setReciterActive/);
  assert.match(management, /\[font-family:var\(--font-ui\)\]/);
  assert.match(management, /ManagementIconButton/);
  assert.match(managementIconButton, /h-11 w-11/);
  assert.match(reciters, /CommitteeStaffSection[\s\S]*setStaffActive=\{studentsApi\.setReciterActive\}/);
});

test('reciter dashboard exposes recitation and own attendance while server checks account and committee scope', async () => {
  const [server, dashboard, login, evaluation, taskList, routes, overview] = await Promise.all([
    read('../server/index.js'),
    read('../src/pages/WajehDashboard.jsx'),
    read('../src/pages/LoginGateway.jsx'),
    read('../src/components/portal/TeacherEvaluationDialog.jsx'),
    read('../src/components/portal/TeacherRecitationTaskList.jsx'),
    read('../src/lib/sectionRoutes.js'),
    read('../server/services/platformOverview.js'),
  ]);

  assert.match(dashboard, /if \(isReciter\) return localizeSections\(baseSections[\s\S]*\['quranEvaluation', 'staffAttendance', 'mushaf'\]\.includes\(section\.key\)[\s\S]*section\.key !== 'staffAttendance' \|\| \(settings\.staffAttendanceSource === 'teacher' && !alreadyPresentToday\)[\s\S]*reciterSectionOrder/);
  assert.match(dashboard, /const reciterSectionOrder = new Map\(\[[\s\S]*\['staffAttendance', 0\][\s\S]*\['quranEvaluation', 1\][\s\S]*\['mushaf', 3\]/);
  assert.match(dashboard, /section\.key === 'mushaf'\) return isManager \|\| isSupervisor \|\| isReciter/);
  assert.match(dashboard, /<StudentMushafSection onBack=/);
  assert.match(login, /\['supervisor', 'admin', 'reciter'\]/);
  assert.match(routes, /\['reciters', 'reciters'\]/);
  assert.match(server, /\['supervisor', 'reciter'\]\.includes\(req\.auth\?\.role\)[\s\S]*Number\(req\.auth\?\.id\) === Number\(accountId\)/);
  assert.match(server, /JOIN supervisor_committees sc ON sc\.committee_id = s\.committee_id AND sc\.supervisor_id = \?/);
  assert.match(server, /const teacherAttendanceMode = canTeacherSetRecitationAttendance\(settings, req\.auth\.role\)/);
  assert.match(server, /accountNotificationsAccess[^\n]*'reciter'/);
  assert.match(evaluation, /teacherAttendanceMode=\{Boolean\(data\?\.students\?\.some\(\(student\) => \([\s\S]*student\.canSetAttendance \|\| student\.nazemManaged[\s\S]*\)\)\)\}/);
  assert.match(taskList, /studentById\.get\(studentId\)/);
  assert.match(taskList, /onRecite && hasRecitationTasks/);
  assert.match(overview, /role = 'reciter'\) AS recitersCount/);
});
