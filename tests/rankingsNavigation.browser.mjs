import { URL } from 'node:url';
import assert from 'node:assert/strict';
import console from 'node:console';
import { chromium } from 'playwright';
import { createStudentHomeFixture, initializeStudentPage, studentHomeResponse, localPortalTestUrl } from './helpers/studentHomeFixture.mjs';

const browser = await chromium.launch();
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const fixture = createStudentHomeFixture();
    await initializeStudentPage(page, fixture.date);
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path.includes('/rankings/')) return route.fulfill({ json: Array.from({ length: 45 }, (_, i) => ({
        id: 990 + i, name: i === 1 ? 'طالب الاختبار' : `اسم الاختبار ${i + 1}`, rank: i + 1, points: 1000 - i,
      })) });
      return route.fulfill(studentHomeResponse(path, fixture));
    });
    await page.goto(localPortalTestUrl());
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
    await checkRankings(page, width);
    await page.screenshot({ path: `outputs/rankings-${width}.png`, fullPage: true });
    await page.goto(`${localPortalTestUrl()}/tests/fixtures/staff-rankings.html`);
    await checkRankings(page, width);
    assert.ok(page.url().includes('staff-rankings'));
    await page.close();
    console.log(`Rankings/profile ${width}: passed`);
  }
} finally { await browser.close(); }

async function checkRankings(page, width) {
  const root = page.locator('[aria-label="لوحة التميز"]');
  await root.locator('li:visible').first().waitFor();
  const desktop = width >= 900;
  const container = root.locator(desktop ? '.student-home-rank-desktop' : '.student-home-rank-mobile');
  const students = desktop ? container.locator('article').nth(0) : container;
  const families = desktop ? container.locator('article').nth(1) : container;
  const count = async (panel, expected) => {
    const rows = panel.locator('ol li');
    assert.equal(await rows.count(), expected);
    assert.deepEqual(await rows.evaluateAll(nodes => nodes.map(node => Number(node.dataset.rank))), Array.from({ length: expected }, (_, i) => i + 1));
  };
  await count(students, 20);
  await students.getByRole('button', { name: 'اعرض المزيد', exact: true }).click();
  await count(students, 30);
  if (!desktop) await container.getByRole('tab', { name: 'أفضل الحلقات' }).click();
  await count(families, 20);
  await families.getByRole('button', { name: 'اعرض المزيد', exact: true }).click();
  await count(families, 30);
  if (!desktop) await container.getByRole('tab', { name: 'أفضل الطلاب' }).click();
  await count(students, 30);
  for (const expected of [40, 45]) {
    await students.getByRole('button', { name: 'اعرض المزيد', exact: true }).click();
    await count(students, expected);
  }
  assert.equal(await students.getByRole('button', { name: 'اعرض المزيد', exact: true }).count(), 0);
  if (!desktop) await container.getByRole('tab', { name: 'أفضل الحلقات' }).click();
  for (const expected of [40, 45]) {
    await families.getByRole('button', { name: 'اعرض المزيد', exact: true }).click();
    await count(families, expected);
  }
  assert.equal(await families.getByRole('button', { name: 'اعرض المزيد', exact: true }).count(), 0);
  assert.equal(await root.getByText(/^(جميع الطلاب|جميع الحلقات|عرض الكل|عرض أقل)$/).count(), 0);
  assert.equal(await container.locator('ol').count(), desktop ? 2 : 1);
  assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
}
