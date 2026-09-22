import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3000';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Local test server required');
const date = '2026-09-08';
const range = { fromPage: 2, toPage: 2, fromSurah: 2, toSurah: 2, fromSurahName: 'البقرة', toSurahName: 'البقرة', fromAyah: 1, toAyah: 3 };
const tasks = ['memorization', 'review', 'link'].map((taskType, i) => ({ ...range, id: i + 1, taskType, taskDate: date, sessionDate: date, studentStatus: i === 0 ? 'done' : null, teacherCompleted: i === 0, mistakeCount: i, warningCount: 0 }));
const browser = await chromium.launch({ headless: true });
const results = [];
await mkdir('outputs', { recursive: true });
try {
  for (const width of [360, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    let savedFailure = true;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.clock.install({ time: new Date(`${date}T12:00:00Z`) });
    await page.addInitScript(() => {
      globalThis.localStorage.setItem('wajeh_role', 'student');
      globalThis.localStorage.setItem('wajeh_student_id', '991');
      globalThis.localStorage.setItem('wajeh_name', 'طالب الاختبار');
      globalThis.localStorage.setItem('madarij_web_session', '1');
      globalThis.localStorage.setItem('wajeh_dashboard_permissions', '[]');
      globalThis.localStorage.setItem('theme', 'light');
    });
    await context.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      let body = [];
      if (path.endsWith('/quran-tasks/execution')) {
        const payload = route.request().postDataJSON();
        assert.deepEqual(payload.taskIds, [3]);
        tasks[2].studentStatus = payload.status;
        return route.fulfill({ json: { success: true } });
      }
      if (path.endsWith('/site-config')) body = { key: 'madarij', features: { studentHome: true } };
      if (path.endsWith('/programs')) body = { programs: [{ id: 1, title: 'القيم', pointsReward: 179, contents: [], questions: [], sectionsEnabled: true, sections: [{ id: 11, title: 'قسم تجريبي', pointsReward: 179, contents: [], questions: [] }] }, { id: 2, title: 'برنامج بعنوان طويل لاختبار تناسق البطاقة', pointsReward: 50, contents: [], questions: [], sections: [] }] };
      if (path.endsWith('/public-settings')) body = { learningPathsEnabled: true, hasStudentQuranExecution: true, pointsSystemEnabled: true, storeEnabled: true, summitEnabled: true, dailyChallengeEnabled: true, dailyChallengeDays: [2], studentRankingsVisible: true, familyRankingsVisible: true, rankingPointsVisible: true };
      if (path.endsWith('/quran-today')) body = { date, plan: { id: 1, progressPercent: 44 }, todayAmounts: tasks, tasks, repeatCount: 10, listeningCount: 3 };
      if (path.endsWith('/quran-sessions')) body = { rows: tasks, points: { total: 1234, days: [{ date, earned: 43, maximum: 45, pending: false, details: [{ label: 'الحضور', earned: 25 }, { label: 'تقييم الحفظ', earned: 18 }] }] } };
      if (path.endsWith('/quran-saved')) {
        if (savedFailure) return route.fulfill({ status: 500, json: { message: 'تعذر تحميل المحفوظ.' } });
        body = Array.from({ length: 30 }, (_, i) => ({ juz: i + 1, label: `الجزء ${i + 1}`, progressPercent: i === 29 ? 0 : 27, savedRanges: i === 29 ? [] : [range, { ...range, fromAyah: 5, toAyah: 5 }] }));
      }
      if (path.endsWith('/summit')) body = { points: 1234, totalKilometers: 10000, stages: [{ points: 1500 }, { points: 3000 }] };
      if (path.endsWith('/daily-challenge')) body = { points: 3, attempt: null };
      if (path.includes('/rankings/students')) body = Array.from({ length: 8 }, (_, i) => ({ id: 990 + i, name: ['عبدالله محمد عبدالرحمن السليمان', 'طالب الاختبار', 'خالد سليمان'][i % 3], committeeName: 'حلقة الإتقان', rank: i + 1, points: 1800 - 50 * i }));
      if (path.includes('/rankings/families')) body = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: `حلقة الإتقان ${i + 1}`, rank: i + 1, points: 12000 - 500 * i }));
      await route.fulfill({ json: body });
    });
    await page.goto(base);
    const task = page.locator('.student-home-execution-task').first();
    await task.waitFor();
    await page.waitForFunction(() => globalThis.document.querySelector('.student-home-level svg'));
    assert.equal(await page.locator('.student-home-level').innerText(), '');
    assert.equal(await page.locator('.student-home-header-progress').count(), 0);
    await page.addStyleTag({content: '*, *::before, *::after { transition: none !important; animation: none !important; }'});
    const selected = await task.evaluate(el => ({ outer: globalThis.getComputedStyle(el).backgroundColor, button: globalThis.getComputedStyle(el.querySelector('button')).backgroundColor, shadow: globalThis.getComputedStyle(el.querySelector('button')).boxShadow }));
    assert.equal(selected.outer, 'rgb(225, 243, 238)');
    assert.equal(selected.button, 'rgba(0, 0, 0, 0)');
    assert.equal(selected.shadow, 'none');
    await page.locator('[data-loading-indicator="screen"]').waitFor({state: 'hidden'});
    await page.screenshot({path: `outputs/program-ui-home-${width}.png`});
    if (width >= 900) await page.getByRole('button', {name: 'قائمة حساب الطالب'}).click();
    await page.getByRole('button', {name: 'البرامج', exact: true}).click();
    await page.locator('.student-program-card').first().waitFor();
    assert.equal(await page.locator('.student-program-card').count(), 2);
    assert.ok(await page.locator('.student-program-card button').evaluateAll(els => els.every(el => el.getBoundingClientRect().height >= 44)));
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    await page.screenshot({path: `outputs/program-ui-cards-${width}.png`});
    const header = page.locator('.student-home-window-header');
    const navigation = page.getByRole('navigation', {name: 'تنقل الطالب'});
    const assertProgramNavigation = async () => {
      assert.equal(await header.count(), width < 900 ? 0 : 1);
      assert.equal(await page.getByRole('button', {name: 'رجوع', exact: true}).count(), width < 900 ? 0 : 1);
      if (width < 900) {
        assert.equal(await navigation.isVisible(), true);
        assert.equal(await navigation.getByRole('button', {name: 'البرامج', exact: true}).getAttribute('aria-current'), 'page');
        const screen = await page.locator('.student-mobile-screen').boundingBox();
        const bar = await navigation.boundingBox();
        assert.ok(screen.y + screen.height <= bar.y + 1, 'program content must not cover bottom navigation');
      }
    };
    await assertProgramNavigation();
    if (width >= 900) assert.equal(await header.locator('h1').evaluate(el => globalThis.getComputedStyle(el).position), 'absolute');
    const back = async () => {
      if (width < 900) await page.goBack();
      else await header.getByRole('button', {name: 'رجوع', exact: true}).click();
    };
    await page.locator('.student-program-card button').first().click();
    await page.getByRole('heading', {name: 'القيم', exact: true}).waitFor();
    await assertProgramNavigation();
    await page.locator('.student-program-card button').first().click();
    await page.getByRole('heading', {name: 'قسم تجريبي', exact: true}).waitFor();
    await assertProgramNavigation();
    await back();
    assert.ok(!new URL(page.url()).searchParams.has('section'));
    await back();
    assert.ok(!new URL(page.url()).searchParams.has('program'));
    if (width < 900) await navigation.getByRole('button', {name: 'الرئيسية', exact: true}).click();
    else await back();
    await page.waitForURL(url => !url.hash);
    if (width < 900) assert.equal(await page.locator('.student-mobile-screen').count(), 0);
    assert.deepEqual(errors, []);
    results.push({width, profile: 'icon', selection: 'uniform', cards: 'passed'});
    await context.close();
  }
  console.log(JSON.stringify(results));
} finally { await browser.close(); }

