import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  getDailyChallengeGame,
  normalizeDailyChallengeDays,
  normalizeDailyChallengeGames,
  pickRandomDailyChallengeGame,
  SUMMIT_DAILY_CHALLENGE_GAME_TYPES,
} from '../shared/daily-challenge.js';
import { createDailyChallenge, isDailyChallengeCorrect } from '../shared/daily-challenge-engine.js';
import { isDailyChallengeAvailable } from '../src/lib/dailyChallengeAvailability.js';

test('daily challenge is configurable, student-only, database-backed, and resets by Saudi date', async () => {
  const [server, router, migration, defaultsMigration, restoreGamesMigration, settings, portal, gateway, hero, removedFeatures, cache] = await Promise.all([
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/routes/dailyChallengeRoutes.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/migrations/2026.08.17.3-daily-challenge.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/migrations/2026.08.17.4-daily-challenge-defaults.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/migrations/2026.08.26.1-restore-rawasi-daily-challenge-games.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/SettingsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AccountPortal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/LoginGateway.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/public/PublicHeroSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../server/middleware/removedFeatures.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/publicSettingsCache.js', import.meta.url), 'utf8'),
  ]);

  assert.match(server, /createDailyChallengeRouter/);
  assert.match(server, /dailyChallengeEnabled: Boolean/);
  assert.match(server, /dailyChallengePoints/);
  assert.match(router, /req\.auth\?\.role === 'student'/);
  assert.match(router, /daily_challenge:\$\{req\.auth\.id\}:\$\{date\}/);
  assert.match(router, /sourceType: 'daily_challenge'/);
  assert.match(migration, /UNIQUE KEY daily_challenge_student_date \(student_id, challenge_date\)/);
  assert.match(defaultsMigration, /dailyChallengePoints/);
  assert.match(restoreGamesMigration, /games\.length !== 1 \|\| games\[0\] !== 'summit_cave'/);
  assert.match(restoreGamesMigration, /JSON\.stringify\(DAILY_CHALLENGE_GAME_TYPES\)/);
  assert.match(settings, /label="تفعيل التحدي اليومي"/);
  assert.match(settings, /valueLabel="مكافأة الفوز:"/);
  assert.match(settings, /الألعاب المتاحة/);
  assert.match(settings, /أيام التحدي/);
  assert.match(portal, /isDailyChallengeAvailable\(settings, saudiClock\)/);
  assert.match(portal, /isImmersiveRouteLoading/);
  assert.match(portal, /\['dailyChallenge', 'summit'\]\.includes\(requestedSection\)/);
  assert.match(portal, /hasDashboard \|\| isLoading \|\| waitingForAttendance \|\| !activeSection/);
  assert.match(portal, /fixed inset-0 z-\[100\].*dailyChallenge/s);
  assert.match(portal, /!isOnline[\s\S]*list\.push\(\{ key: 'dailyChallenge'/);
  assert.match(gateway, /showDailyChallenge=\{dailyChallengeAvailable\}/);
  assert.match(gateway, /useSaudiClock\(\)/);
  assert.match(gateway, /preloadStudentExperiences/);
  assert.match(hero, />\s*التحدي اليومي\s*</);
  assert.match(hero, /showPath \|\| showDailyChallenge/);
  assert.match(router, /getDailyChallengeWeekDay\(date\)/);
  assert.match(router, /getDailyChallengeGame\(date, settings\.dailyChallengeGames\)/);
  assert.doesNotMatch(removedFeatures, /daily-challenge/);
  assert.match(cache, /getStudentExperienceIdentity/);
  assert.match(cache, /getTenantRegistrationNumber\(\)/);
  assert.match(cache, /localStorage\.getItem\('wajeh_student_id'\)/);
  assert.match(cache, /entry\.request === request && entry\.identity === identity/);
  assert.match(cache, /clearStudentExperienceCaches/);
});

test('student homepage shows the daily challenge only on configured Saudi weekdays', () => {
  const tuesday = new Date('2026-08-25T12:00:00Z');
  assert.equal(isDailyChallengeAvailable({ dailyChallengeEnabled: true, dailyChallengeDays: [2] }, tuesday), true);
  assert.equal(isDailyChallengeAvailable({ dailyChallengeEnabled: true, dailyChallengeDays: [1] }, tuesday), false);
  assert.equal(isDailyChallengeAvailable({ dailyChallengeEnabled: false, dailyChallengeDays: [2] }, tuesday), false);
});

test('daily challenge honors selected weekdays while legacy random selection remains bounded', () => {
  assert.deepEqual(normalizeDailyChallengeDays(['0', 2, 6, 8]), [0, 2, 6]);
  const selected = ['size_ordering', 'instant_memory'];
  assert.equal(pickRandomDailyChallengeGame(selected, 0), 'size_ordering');
  assert.equal(pickRandomDailyChallengeGame(selected, 0.99), 'instant_memory');
});

test('daily challenge rotates only through the manager-selected games', () => {
  const selected = normalizeDailyChallengeGames(['math_problems', 'instant_memory', 'invalid']);
  assert.deepEqual(selected, ['math_problems', 'instant_memory']);
  const today = getDailyChallengeGame('2026-08-17', selected);
  const tomorrow = getDailyChallengeGame('2026-08-18', selected);
  assert.ok(selected.includes(today));
  assert.ok(selected.includes(tomorrow));
  assert.notEqual(today, tomorrow);
});

test('daily challenge uses the Rawasi game arena across entry, gameplay, and results', async () => {
  const [section, classicGames, styles, ordering] = await Promise.all([
    readFile(new URL('../src/components/portal/StudentDailyChallengeSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/ClassicDailyChallengeGame.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/studentDailyChallenge.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/DailyChallengeOrdering.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(section, /daily-challenge-app/);
  assert.match(section, /لعبة جديدة كل يوم/);
  assert.doesNotMatch(section, /لعبة عشوائية/);
  assert.match(section, /ClassicDailyChallengeGame/);
  assert.match(classicGames, /<DailyChallengeOrdering/);
  assert.match(ordering, /ScatterArena/);
  assert.match(classicGames, /MEMORY_SECONDS = 10/);
  assert.match(classicGames, /daily-challenge-memory-row/);
  assert.match(ordering, /تأكيد الترتيب/);
  assert.doesNotMatch(section, /يتجدد التحدي تلقائيًا/);
  assert.doesNotMatch(section, /العودة للحساب/);
  assert.match(section, />العودة</);
  assert.match(section, /data\.date !== getSaudiDate\(\)/);
  assert.match(styles, /linear-gradient\(145deg, #00475d/);
  assert.match(styles, /rgb\(215 164 59/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(styles, /font-family: var\(--font-ui\)/);
  assert.match(styles, /daily-challenge-shape-triangle/);
  assert.match(styles, /daily-challenge-shape-rectangle/);
  assert.match(classicGames, /الجولة \{roundIndex \+ 1\} من \{rounds\.length\}/);
  assert.match(classicGames, /completeRound/);
  assert.match(styles, /daily-challenge-round-in/);
});

test('instant memory challenge allows repeated shapes and colors', async () => {
  const engine = await readFile(new URL('../shared/daily-challenge-engine.js', import.meta.url), 'utf8');
  assert.match(engine, /randomItem\(colors\)/);
  assert.match(engine, /randomItem\(shapes\)/);
  assert.match(engine, /'مستطيل'/);
});

test('color difference and size ordering use five progressively harder rounds', async () => {
  const engine = await readFile(new URL('../shared/daily-challenge-engine.js', import.meta.url), 'utf8');
  assert.match(engine, /\[9, 12, 16, 20, 25\]/);
  assert.match(engine, /\[26, 20, 15, 11, 7\]/);
  assert.match(engine, /roundIndex \+ 3/);
  assert.match(engine, /\[26, 20, 16, 13, 11\]/);
  assert.match(engine, /challenge\.rounds\.length === body\.answers\.length/);
  assert.match(engine, /challenge\.rounds\.length === body\.orders\.length/);
});

test('manager can preview every daily challenge through the exact student experience without API writes', async () => {
  const [settings, preview, picker, studentExperience] = await Promise.all([
    readFile(new URL('../src/components/dashboard/SettingsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/DailyChallengePreviewDialog.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/DailyChallengeGamePicker.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/StudentDailyChallengeSection.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(settings, />\s*تجربة\s*</);
  assert.match(preview, /DailyChallengeGamePicker/);
  assert.match(picker, /games\.map/);
  assert.match(preview, /previewGameType=\{selectedGame\}/);
  assert.match(preview, /normalizeDailyChallengeGames\(selectedGames\)/);
  assert.match(settings, /selectedGames=\{settings\.dailyChallengeGames\}/);
  assert.doesNotMatch(preview, /مضافة|إضافة/);
  assert.doesNotMatch(preview, /onToggleGame/);
  assert.doesNotMatch(settings, /onToggleGame=\{\(value\) => toggleListValue\('dailyChallengeGames', value\)\}/);
  assert.match(preview, /fixed inset-0 z-\[1000\] h-dvh overflow-y-auto/);
  assert.match(studentExperience, /previewMode/);
  assert.match(studentExperience, /createDailyChallenge\(previewGameType\)/);
  assert.match(studentExperience, /isDailyChallengeCorrect/);
  assert.match(studentExperience, /submitOfflineDailyChallenge\(studentId, payload\)/);
  assert.match(studentExperience, /duration: GAME_SECONDS/);
  assert.doesNotMatch(studentExperience, /SUMMIT_STAGES\.find/);
});

test('preview and student attempts share generation and grading for every game', () => {
  const size = createDailyChallenge('size_ordering');
  assert.equal(isDailyChallengeCorrect('size_ordering', size, { orders: size.rounds.map((round) => round.answer) }), true);

  const colors = createDailyChallenge('color_difference');
  assert.equal(isDailyChallengeCorrect('color_difference', colors, { answers: colors.rounds.map((round) => round.answer) }), true);

  const math = createDailyChallenge('math_problems');
  assert.equal(isDailyChallengeCorrect('math_problems', math, { answers: math.problems.map((problem) => problem.answer) }), true);

  const memory = createDailyChallenge('instant_memory');
  assert.equal(isDailyChallengeCorrect('instant_memory', memory, { order: memory.answer }), true);
});

test('only the two approved summit games work in daily challenge generation, grading, and preview', () => {
  assert.equal(SUMMIT_DAILY_CHALLENGE_GAME_TYPES.length, 2);
  const answers = {
    summit_forest: (challenge) => ({ trace: challenge.solution.map(([x, y]) => ({ x, y })) }),
    summit_cave: (challenge) => ({ selected: challenge.sequence }),
  };
  SUMMIT_DAILY_CHALLENGE_GAME_TYPES.forEach((type) => {
    const challenge = createDailyChallenge(type);
    const answer = typeof answers[type] === 'function' ? answers[type](challenge) : answers[type];
    assert.equal(isDailyChallengeCorrect(type, challenge, answer), true, type);
  });
  assert.equal(SUMMIT_DAILY_CHALLENGE_GAME_TYPES.includes('summit_waterfall'), false);
  assert.equal(SUMMIT_DAILY_CHALLENGE_GAME_TYPES.includes('summit_bridge'), false);
  assert.equal(SUMMIT_DAILY_CHALLENGE_GAME_TYPES.includes('summit_rocks'), false);
  assert.equal(SUMMIT_DAILY_CHALLENGE_GAME_TYPES.includes('summit_basecamp'), false);
  assert.equal(SUMMIT_DAILY_CHALLENGE_GAME_TYPES.includes('summit_camp'), false);
});
