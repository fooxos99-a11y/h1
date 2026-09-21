import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  for (const [role, session] of [['', false], ['student', false], ['student', true], ['supervisor', true], ['admin', true], ['manager', true]]) {
    const context = await browser.newContext({ viewport: { width: 360, height: 800 }, serviceWorkers: 'block' });
    await context.route('**/api/**', (route) => route.fulfill({ json: route.request().url().includes('public-settings')
      ? { summitEnabled: true, dailyChallengeEnabled: true, dailyChallengeDays: [0, 1, 2, 3, 4, 5, 6] } : {} }));
    await context.addInitScript(({ role, session }) => {
      globalThis.localStorage.setItem('wajeh_role', role);
      globalThis.localStorage.setItem('wajeh_student_id', '990');
      if (session) globalThis.localStorage.setItem('madarij_web_session', '1');
    }, { role, session });
    const page = await context.newPage();
    const response = page.waitForResponse((res) => res.url().includes('public-settings'));
    await page.goto('http://127.0.0.1:3000/');
    await response;
    await page.locator('[data-public-primary-actions]').waitFor({ state: 'attached' });
    const visible = role === 'student' && session;
    if (visible) await page.getByRole('button', { name: 'الخريطة', exact: true }).waitFor();
    for (const name of ['الخريطة', 'التحدي اليومي']) {
      assert.equal(await page.getByRole('button', { name, exact: true }).count(), visible ? 1 : 0, `${role || 'guest'}: ${name}`);
    }
    await context.close();
  }
} finally { await browser.close(); }
