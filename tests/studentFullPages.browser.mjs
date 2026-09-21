import assert from 'node:assert/strict';
import { URL } from 'node:url';
import { chromium } from 'playwright';
import { getBusinessDate } from '../shared/business-date.js';

const browser = await chromium.launch({ headless: true });
try {
  for (const width of [360, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const date = getBusinessDate();
    const errors = [];
    let ready;
    const rankingsGate = new Promise((resolve) => { ready = resolve; });
    await context.addInitScript(() => {
      globalThis.localStorage.setItem('wajeh_role', 'student');
      globalThis.localStorage.setItem('wajeh_student_id', '991');
      globalThis.localStorage.setItem('madarij_web_session', '1');
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await context.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      let body = [];
      if (path.includes('/rankings/')) await rankingsGate;
      if (path.endsWith('/public-settings')) body = { summitEnabled: true, dailyChallengeEnabled: true, dailyChallengeDays: [0,1,2,3,4,5,6], pointsSystemEnabled: true, storeEnabled: true, learningPathsEnabled: true };
      if (path.endsWith('/quran-today')) body = { date, plan: { id: 1, progressPercent: 2 }, tasks: [], todayAmounts: [] };
      if (path.endsWith('/quran-sessions')) body = { rows: [], points: { total: 85 } };
      if (path.endsWith('/summit')) body = { points: 85, displayedKilometers: 0, totalKilometers: 8000, activeStation: { id: 1, kilometer: 0 }, mapConfig: { activeStationId: 1 }, stages: [{ id: 1, points: 0, name: 'بصائر', locationType: 'station', completed: false }] };
      if (path.endsWith('/daily-challenge')) body = { date, points: 3 };
      if (path.endsWith('/offline-student/bootstrap')) body = { date, dailyChallenge: { date, points: 3, attempt: null }, store: { enabled: true, storeBalance: 150, products: [{ id: 1, name: 'منتج المتجر', pointsPrice: 75, stock: 5 }] } };
      await route.fulfill({ json: body });
    });
    await page.goto('http://127.0.0.1:3000/');
    await page.getByRole('status', { name: 'جارٍ فتح الحساب' }).waitFor();
    assert.equal(await page.locator('.student-home-header').isVisible(), false, 'No partial home while rankings are pending');
    ready();
    await page.locator('.student-home-main').waitFor();
    assert.match(await page.locator('.student-home-journey-score').innerText(), /كم/);
    await page.getByRole('button', { name: 'اكتشف الخريطة' }).click();
    await page.getByRole('button', { name: 'متابعة الطريق', exact: true }).click();
    const assertFullPage = async () => {
      assert.equal(await page.getByRole('navigation', { name: 'تنقل الطالب' }).count(), 0);
      assert.equal(await page.locator('.student-home-window-header').count(), 0);
      const box = await page.locator('.student-full-page').boundingBox();
      assert.deepEqual({ x: box.x, y: box.y, width: box.width, height: box.height }, { x: 0, y: 0, width, height: 900 });
    };
    await assertFullPage();
    assert.equal(await page.locator('.summit-map-balance').count(), 0);
    const toggle = page.locator('.summit-view-toggle');
    assert.ok(await toggle.evaluate((el) => { const b = el.getBoundingClientRect(); return el.contains(globalThis.document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)); }), 'Map switch is visible and clickable');
    await toggle.click();
    await page.getByRole('button', { name: 'العودة إلى منظور الطريق' }).waitFor();
    await page.screenshot({ path: `outputs/student-full-map-${width}.png` });
    await page.getByRole('button', { name: 'الرجوع', exact: true }).click();
    await page.getByRole('button', { name: 'اكتشف الخريطة' }).click();
    await page.locator('.summit-map-shell').waitFor();
    assert.equal(await page.getByRole('button', { name: 'متابعة الطريق', exact: true }).count(), 0, 'Arrival notice is not repeated');
    await page.getByRole('button', { name: 'الرجوع', exact: true }).click();
    await page.getByRole('button', { name: 'ابدأ التحدي', exact: true }).click();
    await page.locator('.daily-challenge-app').waitFor();
    await assertFullPage();
    assert.equal(await page.locator('.daily-challenge-header').count(), 1);
    await page.screenshot({ path: `outputs/student-full-challenge-${width}.png` });
    await page.goto('http://127.0.0.1:3000/#student/store');
    await page.getByRole('heading', { name: 'منتج المتجر' }).waitFor();
    assert.equal(await page.getByRole('dialog', { name: 'المتجر' }).count(), 0);
    const storeBox = await page.locator('.student-home-window').boundingBox();
    assert.equal(storeBox.x, 0);
    assert.equal(storeBox.width, width);
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
    if (width < 900) assert.equal(await page.getByRole('navigation', { name: 'تنقل الطالب' }).isVisible(), true);
    else assert.equal(await page.getByRole('button', { name: 'رجوع', exact: true }).isVisible(), true);
    await page.screenshot({ path: `outputs/student-store-${width}.png` });
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally { await browser.close(); }
