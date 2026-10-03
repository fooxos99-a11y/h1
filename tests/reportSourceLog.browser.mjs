import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch();
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:3017/tests/fixtures/report-source-log.html');
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /مصدر غير محدد/ }).waitFor();
    assert.equal(await dialog.getByText(/الحركة الأقدم/).count(), 0);
    await dialog.getByRole('button', { name: /مصدر غير محدد/ }).click();
    await dialog.getByRole('heading', { name: 'مصدر غير محدد', exact: true }).waitFor();
    const notes = await dialog.locator('p').allTextContents();
    assert.ok(notes.findIndex(text => text.includes('الحركة الأقدم')) < notes.findIndex(text => text.includes('الحركة الأحدث')));
    assert.equal(await dialog.getByText(/درجة التسميع/).count(), 0);
    await dialog.getByRole('button', { name: 'المصادر', exact: true }).click();
    await dialog.getByRole('button', { name: /تقييم جلسة التسميع/ }).focus();
    await page.keyboard.press('Enter');
    await dialog.getByText(/درجة التسميع/).waitFor();
    assert.equal(await dialog.getByText(/الحركة الأقدم|الحركة الأحدث/).count(), 0);
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
    await page.screenshot({ path: `outputs/report-source-log-${width}.png` });
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally { await browser.close(); }
globalThis.console.info('Source filtering, oldest-first order, keyboard access and responsive layouts passed.');
