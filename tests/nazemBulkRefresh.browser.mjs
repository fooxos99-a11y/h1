import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    for (const width of [360, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto('http://127.0.0.1:3000/tests/fixtures/nazem-bulk-refresh.html');
      const button = page.getByRole('button', { name: 'تحديث الكل', exact: true });
      await button.waitFor();
      assert.ok((await button.boundingBox()).height >= 44);
      await button.focus();
      await page.keyboard.press('Enter');
      await page.getByText('اكتمل التحديث', { exact: true }).first().waitFor();
      assert.equal(await page.getByText('اكتمل التحديث', { exact: true }).count(), 2);
      assert.deepEqual(await page.evaluate(() => globalThis.bulkFixture.calls), [1, 2]);
      assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth), true);
      const ids = await page.locator('section[aria-labelledby]').evaluateAll((items) => items.map((item) => item.getAttribute('aria-labelledby')));
      assert.equal(new Set(ids).size, 2);
      await page.close();
    }
  } finally { await browser.close(); }
}
globalThis.console.log('Bulk refresh passed in Chromium and WebKit at 360, 768 and 1440px.');
