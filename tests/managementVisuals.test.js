import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('RTL setting toggles place the thumb on the left only when enabled', async () => {
  const toggle = await readFile(new URL('../src/components/ui/setting-toggle.jsx', import.meta.url), 'utf8');

  assert.match(toggle, /checked \? 'translate-x-0' : 'translate-x-5'/);
});

test('management actions share subtle borders and family preview shows contact details only', async () => {
  const [iconButton, reports, students, plans, families, staff, server] = await Promise.all([
    readFile(new URL('../src/components/ui/management-icon-button.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/ReportsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/StudentsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/StudentPlansSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/FamiliesSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/CommitteeStaffSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
  ]);

  assert.match(iconButton, /variant="outline"/);
  assert.match(iconButton, /border-border\/70 shadow-none/);
  assert.doesNotMatch(iconButton, /border-destructive\/50/);
  assert.match(reports, /const controlGridClass = isRecitationSessionsReport \? 'grid-cols-3 gap-1.5 sm:gap-3' : 'grid-cols-2'/);
  assert.match(reports, /id="execution-followup-report-controls"[\s\S]*className="contents"/);
  assert.match(reports, /sm:w-\[220px\]/);
  for (const source of [students, plans, families, staff]) {
    assert.match(source, /ManagementIconButton/);
  }
  assert.match(families, /student\.guardianPhone/);
  assert.doesNotMatch(families, /student\.points/);
  assert.match(server, /guardian_phone AS guardianPhone[\s\S]*FROM students[\s\S]*WHERE committee_id = \?/);
});

test('selected recitation policy text is white and the sidebar selection is a borderless translucent fill', async () => {
  const [settings, sidebar] = await Promise.all([
    readFile(new URL('../src/components/dashboard/SettingsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/DashboardSidebarContent.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(settings, /<EvaluationUnitSelector/);
  const selector = await readFile(new URL('../src/components/dashboard/EvaluationUnitSelector.jsx', import.meta.url), 'utf8');
  for (const value of ['face', 'quarterFace', 'halfFace']) assert.ok(selector.includes(`value: '${value}'`));
  assert.match(selector, /selected \? 'text-white hover:text-white'/);
  assert.match(sidebar, /\? 'bg-white\/15 text-white'/);
  assert.match(sidebar, /var\(--brand-navigation-accent\)/);
  assert.doesNotMatch(sidebar, /border-\[#f0bd55\]|shadow-\[0_8px_22px/);
});

test('gold action buttons keep white labels across shared and custom surfaces', async () => {
  const [button, dailyChallenge, datePicker, competitions] = await Promise.all([
    readFile(new URL('../src/components/ui/button.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/StudentDailyChallengeSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ui/date-picker.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/CulturalCompetitionSection.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(button, /bg-primary !text-white/);
  assert.match(dailyChallenge, /bg-\[#d7a43b\][^"\n]*!text-white/);
  assert.match(datePicker, /bg-primary !text-white/);
  assert.match(competitions, /bg-primary[^"\n]*!text-white/);
});
