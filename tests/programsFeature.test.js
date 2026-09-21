import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('programs use optional text content, optional files, and latest-attempt points', async () => {
  const [server, router, database, dashboard, portal, editor, permissions, cards, dialog, choice, section, api] = await Promise.all([
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/routes/programRoutes.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/db.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/WajehDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AccountPortal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/ProgramEditorDialog.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/dashboardPermissions.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/programs/StudentProgramCard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/StudentProgramContent.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/programs/ProgramChoiceIndicator.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/ProgramsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/studentsApi.js', import.meta.url), 'utf8'),
  ]);

  assert.match(server, /learningPathsEnabled: settings\.learningPathsEnabled === 'true'/);
  assert.match(server, /learningPathsEnabled: Boolean\(settings\.learningPathsEnabled\)/);
  assert.match(server, /if \(path\.startsWith\('\/programs'\)\) return \['programs'\]/);
  assert.match(database, /allow_multiple_attempts TINYINT\(1\) NOT NULL DEFAULT 0/);
  assert.match(database, /block_type ENUM\('text', 'link', 'pdf', 'image', 'file'\)/);
  assert.doesNotMatch(router, /نص المحتوى مطلوب/);
  assert.match(router, /const attachment = submittedContents\.find\(\(item\) => item\?\.type === 'file'\)/);
  assert.match(router, /if \(previous && !program\.allowMultipleAttempts\)/);
  assert.match(router, /const delta = targetPoints - Number\(previous\?\.earnedPoints \|\| 0\)/);
  assert.match(router, /points: targetPoints/);
  assert.doesNotMatch(router, /bestScore|bestPoints/);
  assert.match(router, /dedupeKey: `learning_path:\$\{req\.auth\.id\}:\$\{program\.id\}`/);
  assert.match(router, /includeAnswers: !studentId/);
  assert.match(dashboard, /narrationDay[\s\S]*programs/);
  assert.doesNotMatch(dashboard, /section\.key === 'programs' && !settings\.learningPathsEnabled/);
  assert.match(portal, /settings\.learningPathsEnabled.*key: 'programs'/);
  assert.match(permissions, /key: 'programs'.*label: 'البرامج'/);
  assert.match(router, /router\.get\('\/configuration', requireProgramManagement/);
  assert.match(router, /router\.patch\('\/configuration', requireProgramManagement/);
  assert.match(section, /label="تفعيل البرامج"/);
  assert.match(section, /<DashboardMobileHeaderActions>[\s\S]*<DashboardHeaderToggle/);
  assert.doesNotMatch(section, /<Card>[\s\S]{0,300}label="تفعيل البرامج"/);
  assert.match(api, /getProgramsConfiguration/);
  assert.match(api, /updateProgramsConfiguration/);
  assert.match(editor, /النص \(اختياري\)/);
  assert.match(editor, /إرفاق ملف/);
  assert.match(editor, /السماح بأكثر من محاولة/);
  assert.doesNotMatch(editor, /مفعل ويظهر للطلاب|غلاف|رابط|PDF|صورة داخل المحتوى/);
  assert.match(cards, /النتيجة: \{units\.format\(program\.earnedPoints\)\}/);
  assert.match(cards, />ابدأ<\/Button>/);
  assert.doesNotMatch(cards, /أفضل نتيجة|\{program\.(?:contents|questions)\.length\}/);
  assert.doesNotMatch(cards, /عرض المحتوى/);
  assert.match(dialog, /setPhase\('quiz'\)/);
  assert.match(dialog, /setQuestionIndex\(\(current\) => current \+ 1\)/);
  assert.match(dialog, /تم الانتهاء من الاختبار!/);
  assert.match(dialog, /rewardUnits\.format\(result\.earnedPoints\)/);
  assert.doesNotMatch(dialog, /<Dialog|setTimeout/);
  assert.doesNotMatch(dialog, />رجوع<\/Button>/);
  assert.doesNotMatch(dialog, /إعادة المحاولة|أفضل نتيجة/);
  assert.match(choice, /bg-primary/);
});
