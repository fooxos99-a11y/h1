import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { setTimeout as delay } from 'node:timers/promises';

const browser = await chromium.launch({ headless: true });
const empty = (id, title, completedAt = null, earnedPoints = 0) => ({ id, title, completedAt, earnedPoints, contents: [], questions: [], pointsReward: 100 });
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      globalThis.localStorage.setItem('wajeh_role', 'student');
      globalThis.localStorage.setItem('wajeh_student_id', '991');
      globalThis.localStorage.setItem('madarij_web_session', '1');
    });
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let json = [];
      if (path.endsWith('/public-settings')) json = { learningPathsEnabled: true, storeEnabled: true, pointsSystemEnabled: true, hasStudentQuranExecution: false, summitEnabled: false, dailyChallengeEnabled: false };
      if (path.endsWith('/site-config')) json = {};
      if (path.endsWith('/quran-today')) json = { tasks: [], todayAmounts: [] };
      if (path.endsWith('/quran-sessions')) json = { rows: [], points: { total: 0, days: [] } };
      if (path.endsWith('/programs')) json = { programs: [empty(1, 'بانتظار الرصد'), empty(2, 'رصيد صفري', '2026-09-22', 0), empty(3, 'رصيد مكتمل', '2026-09-22', 25), { ...empty(4, 'برنامج الأقسام'), sectionsEnabled: true, sections: [empty(5, 'قسم بلا محتوى')] }] };
      if (path.endsWith('/store/products')) { await delay(1400); json = { products: [], storeBalance: 0 }; }
      await route.fulfill({ json });
    });
    await page.goto('http://127.0.0.1:3017/#student/programs');
    await page.locator('[data-loading-indicator="screen"]').waitFor({ state: 'hidden' });
    const card = title => page.locator('.student-program-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    await card('بانتظار الرصد').waitFor();
    for (const title of ['بانتظار الرصد', 'رصيد صفري', 'رصيد مكتمل']) assert.equal(await card(title).getByRole('button').count(), 0);
    await card('بانتظار الرصد').getByText('لم تُرصد النقاط بعد').waitFor();
    await card('رصيد صفري').getByText('النقاط المرصودة').waitFor();
    assert.match(await card('رصيد صفري').innerText(), /[0٠]/);
    assert.match(await card('رصيد مكتمل').innerText(), /25|٢٥/);
    await page.screenshot({ path: `outputs/program-status-${width}.png` });
    await card('برنامج الأقسام').getByRole('button', { name: 'ابدأ' }).click();
    await card('قسم بلا محتوى').getByText('لم تُرصد النقاط بعد').waitFor();
    assert.equal(await card('قسم بلا محتوى').getByRole('button').count(), 0);
    if (width < 900) {
      const nav = page.getByRole('navigation', { name: 'تنقل الطالب' });
      await nav.getByRole('button', { name: 'البرامج', exact: true }).click();
      await card('بانتظار الرصد').waitFor();
      assert.equal(new URL(page.url()).searchParams.has('program'), false);
      await nav.getByRole('button', { name: 'المتجر', exact: true }).click();
      const cover = page.locator('[data-loading-indicator="content"]');
      await cover.waitFor();
      assert.equal(await page.locator('[data-loading-indicator="screen"]').count(), 0);
      const bounds = await cover.boundingBox();
      const navigation = await nav.boundingBox();
      assert.ok(bounds.y + bounds.height <= navigation.y + 1, 'loading stays above bottom navigation');
      await nav.getByRole('button', { name: 'الرئيسية', exact: true }).click();
      await cover.waitFor({ state: 'hidden' });
      assert.equal(new URL(page.url()).hash, '');
    }
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
    await page.close();
  }
} finally { await browser.close(); }
