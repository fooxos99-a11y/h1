import assert from 'node:assert/strict';
import process from 'node:process';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const origin = process.env.RECITATION_TEST_UI_URL || 'http://127.0.0.1:3034';
assert.equal(new globalThis.URL(origin).hostname, '127.0.0.1');
await mkdir('outputs/recitation-amounts-preference', { recursive: true });
for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch({ headless: true });
  try {
    for (const width of [360, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const hidden = () => page.getByRole('button', { name: 'إظهار جميع المقادير', exact: true });
      const shown = () => page.getByRole('button', { name: 'إخفاء جميع المقادير', exact: true });
      await page.goto(`${origin}/tests/fixtures/local-recitation.html`);
      await hidden().waitFor();
      assert.equal(await page.locator('.recitation-amount').count(), 0);
      await hidden().click();
      await shown().waitFor();
      const amounts = await page.locator('.recitation-amount').allTextContents();
      assert.ok(amounts.length > 0);
      await page.reload();
      await shown().waitFor();
      await page.getByRole('button', { name: 'حفظ', exact: true }).waitFor();
      assert.deepEqual(await page.locator('.recitation-amount').allTextContents(), amounts);
      await page.getByRole('button', { name: 'حفظ', exact: true }).click();
      await page.getByRole('dialog').waitFor();
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await shown().waitFor();
      await shown().click();
      await page.reload();
      await hidden().waitFor();
      assert.equal(await page.locator('.recitation-amount').count(), 0);
      assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `outputs/recitation-amounts-preference/${name}-${width}.png` });
      await context.close();
    }
  } finally { await browser.close(); }
}
