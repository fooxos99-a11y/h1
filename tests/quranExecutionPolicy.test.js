import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  canStudentExecuteQuranTask,
  canStudentSetQuranTaskEnd,
  canTeacherExecuteQuranTask,
  compareQuranPositionInDirection,
  getQuranTaskExecutionSource,
  orderQuranRangesBeforePosition,
} from '../shared/quran-execution-policy.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('reverse-surah plans keep ayahs ascending inside each surah', () => {
  const start = { page: 521, surah: 51, ayah: 7 };
  const end = { page: 521, surah: 51, ayah: 30 };
  const nextSurah = { page: 518, surah: 50, ayah: 1 };
  assert.ok(compareQuranPositionInDirection(end, start, -1) > 0);
  assert.ok(compareQuranPositionInDirection(nextSurah, end, -1) > 0);
});

test('reverse-surah linking selects yesterday within the same surah and excludes future lower surahs', () => {
  const ranges = [
    {
      id: 'yesterday',
      startPage: 520,
      startSurah: 51,
      startAyah: 1,
      endPage: 520,
      endSurah: 51,
      endAyah: 6,
    },
    {
      id: 'future-saved',
      startPage: 517,
      startSurah: 49,
      startAyah: 12,
      endPage: 519,
      endSurah: 50,
      endAyah: 35,
    },
  ];

  const ordered = orderQuranRangesBeforePosition(
    ranges,
    { page: 521, surah: 51, ayah: 7 },
    -1,
  );

  assert.deepEqual(ordered.map(({ range }) => range.id), ['yesterday']);
  assert.deepEqual(ordered[0].traversalEnd, { page: 520, surah: 51, ayah: 6 });
});

test('memorization execution can belong to the student while evaluation remains available to the teacher', () => {
  const settings = {
    memorizationExecutionSource: 'student',
    reviewExecutionSource: 'student',
    linkExecutionSource: 'teacher',
    repeatExecutionSource: 'both',
  };
  assert.equal(getQuranTaskExecutionSource(settings, 'memorization'), 'student');
  assert.equal(canStudentExecuteQuranTask(settings, 'memorization'), true);
  assert.equal(canTeacherExecuteQuranTask(settings, 'memorization'), true);
  assert.equal(canStudentExecuteQuranTask(settings, 'review'), true);
  assert.equal(canTeacherExecuteQuranTask(settings, 'review'), false);
  assert.equal(canStudentExecuteQuranTask(settings, 'link'), false);
  assert.equal(canTeacherExecuteQuranTask(settings, 'link'), true);
  assert.equal(canStudentExecuteQuranTask(settings, 'repeat'), true);
  assert.equal(canTeacherExecuteQuranTask(settings, 'repeat'), false);
  assert.equal(getQuranTaskExecutionSource(settings, 'repeat'), 'student');
});

test('memorization defaults to teacher execution for backward compatibility', () => {
  assert.equal(getQuranTaskExecutionSource({}, 'memorization'), 'teacher');
  assert.equal(canStudentExecuteQuranTask({}, 'memorization'), false);
  assert.equal(canTeacherExecuteQuranTask({}, 'memorization'), true);
});

test('memorization reduction, compensation, and forward increase are independent permissions', () => {
  const fixed = {
    studentTaskAmountEditable: false,
    allowQuranCompensation: false,
    allowQuranExtra: false,
  };
  assert.equal(canStudentSetQuranTaskEnd(fixed, 'memorization', -1), false);
  assert.equal(canStudentSetQuranTaskEnd(fixed, 'memorization', 0), true);
  assert.equal(canStudentSetQuranTaskEnd(fixed, 'memorization', 1), false);
  assert.equal(canStudentSetQuranTaskEnd({ ...fixed, studentTaskAmountEditable: true }, 'memorization', -1), true);
  assert.equal(canStudentSetQuranTaskEnd({ ...fixed, allowQuranCompensation: true }, 'memorization', -1), false);
  assert.equal(canStudentSetQuranTaskEnd({ ...fixed, allowQuranCompensation: true }, 'memorization', 1), true);
  assert.equal(canStudentSetQuranTaskEnd({ ...fixed, allowQuranExtra: true }, 'memorization', 1), true);
  assert.equal(canStudentSetQuranTaskEnd({ ...fixed, allowQuranCompensation: true }, 'review', 1), false);
});

test('execution ownership and configured count limits are enforced on the server', async () => {
  const [server, migration, selector] = await Promise.all([
    read('../server/index.js'),
    read('../server/migrations/2026.08.25.7-quran-execution-ownership.js'),
    read('../src/components/portal/RepeatCountSelector.jsx'),
  ]);
  assert.match(migration, /execution_actor_role/);
  assert.match(server, /سبق أن اعتمد المعلم تنفيذ هذه المهمة/);
  assert.match(server, /execution_actor_role = 'student'/);
  assert.match(server, /execution_actor_role = 'teacher'/);
  assert.match(server, /!nazemManaged && settings\.allowRepeatCountEditing[\s\S]*req\.body\.repeatCount/);
  assert.match(server, /!nazemManaged && settings\.allowListeningCountEditing[\s\S]*req\.body\.listeningCount/);
  assert.match(server, /Math\.min\(expectedRepeatCount, Math\.max\(1/);
  assert.match(server, /Math\.min\(expectedListeningCount, Math\.max\(1/);
  assert.match(server, /const QURAN_EXTRA_FORWARD_FACES = 50/);
  assert.match(server, /allowRepeatCountEditing: !nazemManaged[\s\S]*canStudentExecuteQuranTask\(settings, 'memorization'\)/);
  assert.match(selector, /Array\.from\(\{ length: selectableMaximum \}/);
});

test('Nazem isolates linked plans and restores normal settings when disabled', async () => {
  const [server, routes, settings] = await Promise.all([
    read('../server/index.js'),
    read('../server/routes/nazemIntegrationRoutes.js'),
    read('../src/components/dashboard/SettingsSection.jsx'),
  ]);
  assert.match(server, /nazemIntegrationEnabled \? 'same_day'/);
  assert.match(server, /previousSettings\.nazemIntegrationEnabled[\s\S]*\? 'same_day'/);
  assert.match(routes, /\('recitationAmountDay', 'same_day'\)/);
  assert.match(routes, /recitationAmountDayBeforeNazem/);
  assert.match(routes, /last_error_code = 'NAZEM_DISABLED'/);
  const sharedPolicy = await read('../shared/evaluation-settings.js');
  assert.match(server, /return getRecitationEvaluationPolicy\(settings, task\)/);
  assert.match(sharedPolicy, /passingScore: Number\(settings\[`\$\{prefix\}PassingScore`\] \|\| 85\)/);
  assert.match(server, /allowQuranCompensation: settings\.allowQuranCompensation !== 'false'/);
  assert.match(server, /allowQuranExtra: settings\.allowQuranExtra === 'true'/);
  assert.match(server, /task\.nazemManaged[\s\S]*allowQuranCompensation: false, allowQuranExtra: !nazemLate/);
  assert.match(server, /canTeacherExecuteQuranTask\(settings, task\.taskType\)/);
  assert.match(settings, /\{!settings\.nazemIntegrationEnabled && \(\s*<div className="grid gap-3 sm:grid-cols-2">[\s\S]*?<Label>تنفيذ الحفظ عن طريق<\/Label>[\s\S]*?<Label>تحضير الطلاب عن طريق<\/Label>[\s\S]*?<\/div>\s*\)\}/);
  assert.doesNotMatch(settings, /!settings\.nazemIntegrationEnabled[\s\S]{0,120}label="حد النجاح"/);
  assert.doesNotMatch(settings, /!settings\.nazemIntegrationEnabled[\s\S]{0,200}label="السماح بإكمال الحفظ المتأخر/);
});

test('student-owned Nazem review and link create official follow-up records', async () => {
  const server = await read('../server/index.js');
  assert.match(server, /async function saveStudentNazemExecutionAttempts/);
  assert.match(server, /nazem:student-\$\{task\.taskType\}:/);
  assert.match(server, /nazemManaged && \['review', 'link'\]\.includes\(first\.taskType\)/);
  assert.match(server, /saveStudentNazemExecutionAttempts[\s\S]*enqueueNazemRecitation/);
  assert.match(server, /teacher_completed = \?[\s\S]*evaluated_by = \?/);
});

test('review and link cannot extend beyond their assigned range and failed evaluations remove rewards', async () => {
  const server = await read('../server/index.js');
  assert.match(server, /\['review', 'link'\]\.includes\(first\.taskType\)[\s\S]*\? expectedEnd/);
  assert.match(server, /const groupPassed = groupEvaluated[\s\S]*targetPoints: groupPassed \? repeatReward\.total : 0/);
  assert.match(server, /t\.task_type = 'review' AND \$\{acceptedQuranExecutionSql\('t'\)\}/);
  assert.match(server, /Math\.min\(100, Math\.round\(\(achievedFaces \/ expectedFaces\) \* 100\)\)/);
});

test('Nazem review keeps its remote day while memorization remains editable', async () => {
  const server = await read('../server/index.js');
  assert.doesNotMatch(server, /getNazemReviewAllowedEnd/);
  assert.match(server, /const allowedEnd = fixedRange \|\| row\.taskType === 'review'/);
  assert.match(server, /const candidates = fixedRange \? \[scheduledEnd\] : \[start, scheduledEnd, allowedEnd\]/);
  assert.match(server, /selectionStart: start/);
  assert.match(server, /selectionEnd: allowedEnd/);
  assert.match(server, /fixedRange && !isSameQuranPosition\(requestedEnd, expectedEnd\)/);
  assert.match(server, /: planEnd;[\s\S]*resolveExecutionEndPosition/);
  assert.match(server, /partial \|\| extended \? requestedEnd\.surah/);
  assert.match(server, /extended \? 'extra' : 'complete'/);
  assert.match(server, /normalEnd: nazemScheduledEnd[\s\S]*extraEnd: nazemLate \? nazemScheduledEnd : nazemPlanEnd/);
});
