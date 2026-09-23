import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import sharp from 'sharp';
const red = await sharp({ create: { width: 800, height: 400, channels: 3, background: '#003d51' } }).png().toBuffer();
const gold = await sharp({ create: { width: 300, height: 800, channels: 3, background: '#c49a47' } }).png().toBuffer();
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    let stored = { revision: 0, entries: [red, gold].map((buffer, index) => ({ id: `entry-${index}`, title: `خبر ${index + 1}`, image: `data:image/png;base64,${buffer.toString('base64')}`, committeeIds: [], startsAt: '', endsAt: '', enabled: true })) };
    await page.route('**/api/student-news**', async route => {
      const request = route.request();
      if (request.method() === 'PUT') stored = { ...request.postDataJSON(), revision: stored.revision + 1 };
      await route.fulfill({ json: request.url().endsWith('/audience') ? [{ id: 4, name: 'حلقة النور' }, { id: 5, name: 'حلقة الفجر' }] : stored });
    });
    await page.goto('http://127.0.0.1:3017/tests/fixtures/student-news.html');
    const image = page.locator('img').first();
    await image.waitFor();
    await page.waitForFunction(() => globalThis.getComputedStyle(globalThis.document.querySelector('img')).objectFit === 'contain');
    assert.ok((await image.boundingBox()).height <= 180);
    assert.equal(await page.getByRole('heading').count(), 0, 'No repeated news heading');
    if (width === 360) {
      await page.waitForTimeout(5200);
      assert.equal(await page.getByRole('button', { name: 'الصورة 2', exact: true }).getAttribute('aria-pressed'), 'true');
    }
    await page.getByRole('button', { name: 'الصورة 1', exact: true }).click();
    await page.getByRole('button', { name: /تكبير الصورة/ }).click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button', { name: 'إغلاق', exact: true }).click();
    await page.goto('http://127.0.0.1:3017/tests/fixtures/student-news.html?editor');
    await page.getByRole('button', { name: 'تعديل', exact: true }).first().click();
    await page.getByLabel('الخبر', { exact: true }).fill('تكريم المتميزين');
    await page.getByLabel('بداية العرض').fill('2026-09-24T09:00');
    await page.getByLabel('نهاية العرض').fill('2026-10-01T18:30');
    await page.getByRole('button', { name: 'جميع الحلقات', exact: true }).click();
    await page.getByRole('button', { name: 'حلقة النور', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'حلقة الفجر', exact: true }).isVisible(), true, 'Selection keeps dropdown open');
    await page.getByRole('button', { name: 'حلقة الفجر', exact: true }).click();
    await page.getByLabel('الخبر', { exact: true }).click();
    await page.getByLabel('صورة الخبر', { exact: true }).setInputFiles({ name: 'news.png', mimeType: 'image/png', buffer: gold });
    await page.screenshot({ path: `outputs/news-dialog-${width}.png`, fullPage: true });
    const dialog = await page.getByRole('dialog').boundingBox();
    assert.ok(dialog.x >= 0 && dialog.x + dialog.width <= width);
    assert.ok(await page.getByRole('dialog').evaluate(node => node.scrollWidth <= node.clientWidth), 'No dialog horizontal overflow');
    await Promise.all([
      page.waitForResponse(response => response.url().includes('/student-news/manage') && response.request().method() === 'PUT'),
      page.getByRole('button', { name: 'حفظ', exact: true }).click(),
    ]);
    assert.equal(stored.entries[0].title, 'تكريم المتميزين');
    assert.deepEqual(stored.entries[0].committeeIds, [4, 5]);
    assert.equal(stored.entries[0].endsAt, '2026-10-01T18:30');
    assert.equal(stored.entries[1].endsAt, '', 'Second news item retains its independent schedule');
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    await page.screenshot({ path: `outputs/news-editor-${width}.png`, fullPage: true });
    if (width === 360) {
      stored.entries = [];
      await page.goto('http://127.0.0.1:3017/tests/fixtures/student-news.html');
      assert.equal(await page.locator('section').count(), 0);
      assert.equal(await page.getByText(/تعذر|إعادة المحاولة/).count(), 0);
    }
    await page.close();
  }
} finally { await browser.close(); }
