import { URL } from 'node:url';
import assert from 'node:assert/strict';
import console from 'node:console';
import { chromium } from 'playwright';
import { createStudentHomeFixture, initializeStudentPage, studentHomeResponse } from './helpers/studentHomeFixture.mjs';

const browser = await chromium.launch();
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const fixture = createStudentHomeFixture();
    await initializeStudentPage(page, fixture.date);
    await page.route('**/api/**', route => route.fulfill(studentHomeResponse(new URL(route.request().url()).pathname, fixture)));
    await page.goto('http://127.0.0.1:3018/');
    const trigger = page.getByRole('button', { name: 'قائمة حساب الطالب' });
    await trigger.waitFor();
    const before = await trigger.boundingBox();
    await trigger.click();
    const account = page.locator('[aria-label="الحساب"]');
    await account.getByText('#2', { exact: true }).waitFor();
    assert.ok(await account.getByText('طالب الاختبار', { exact: true }).isVisible());
    assert.equal(await account.locator('img').count(), 0);
    const after = await trigger.boundingBox();
    assert.ok(Math.abs(after.x - before.x) < 1 && Math.abs(after.y - before.y) < 1);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'عرض الكل', exact: true }).click();
    const all = page.locator('[aria-label="الترتيب الكامل"]');
    await all.waitFor();
    const visibleList = all.locator(width >= 900 ? '.student-home-rank-desktop' : '.student-home-rank-mobile');
    assert.equal(await visibleList.locator('ol').first().locator('li').count(), 8);
    assert.ok((await all.boundingBox()).y < 400);
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    await page.screenshot({ path: `outputs/rankings-${width}.png` });
    await page.goto('http://127.0.0.1:3018/tests/fixtures/staff-rankings.html');
    await page.getByRole('button', { name: 'عرض الكل', exact: true }).click();
    await page.locator('[aria-label="الترتيب الكامل"]').waitFor();
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    assert.ok(page.url().includes('staff-rankings'));
    await page.close();
    console.log(`Rankings/profile ${width}: passed`);
  }
} finally { await browser.close(); }
