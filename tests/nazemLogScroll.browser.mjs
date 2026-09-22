import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch();
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.route('**/api/**', route => route.fulfill({ json: {} }));
    await page.goto('http://127.0.0.1:3017/tests/fixtures/nazem-session-wallet.html?scroll');
    const dialog = page.getByRole('dialog');
    await page.getByRole('article').first().waitFor();
    await dialog.hover();
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(300);
    assert.ok(await dialog.evaluate(el => el.scrollTop > 0), 'mouse wheel must scroll the log over its cards');
    await page.mouse.wheel(0, 20000);
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'إغلاق', exact: true }).click();
    await page.close();
  }
} finally { await browser.close(); }
