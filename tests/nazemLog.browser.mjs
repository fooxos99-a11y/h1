import assert from 'node:assert/strict';
import console from 'node:console';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 800 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:3018/tests/fixtures/nazem-log.html');
    const dialog = page.getByRole('dialog');
    const first = dialog.locator('article').first();
    await first.waitFor();
    await dialog.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
    assert.equal(await first.locator('time').innerText(), '2026-09-28 12:30:00');
    assert.ok(await first.getByText('الطالب صاحب آخر تحديث', { exact: true }).isVisible());
    assert.ok(await first.getByText('قيد الانتظار', { exact: true }).first().isVisible());
    assert.equal(await first.locator('details[open]').count(), 0);
    const bounds = await dialog.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, overflow: element.scrollWidth - element.clientWidth, rtl: globalThis.getComputedStyle(element).direction };
    });
    assert.ok(bounds.left >= 0 && bounds.right <= width && bounds.overflow <= 1, JSON.stringify(bounds));
    assert.equal(bounds.rtl, 'rtl');
    await page.screenshot({ path: `outputs/nazem-log-${width}.png` });
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`Nazem log: ${width}px passed`);
  }
} finally { await browser.close(); }
