import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    for (const width of [360, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto('http://127.0.0.1:3000/tests/fixtures/recitation-saved.html');
      await page.getByText('لا توجد مهام للتقييم.', { exact: true }).waitFor();
      assert.equal(await page.getByText('طالب', { exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'ربط', exact: true }).count(), 0);
      assert.equal(await page.getByText(/بانتظار المزامنة|تعذرت المزامنة/).count(), 0);
      await page.evaluate(() => globalThis.savedFixture.next());
      await page.getByRole('button', { name: 'ربط', exact: true }).waitFor();
      await page.locator('time[datetime="2026-09-06"]').waitFor();
      assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth), true);
      await page.close();
    }
  } finally { await browser.close(); }
}
globalThis.console.log('Saved-task visibility, dated next task and completed-student removal passed Chromium/WebKit at 360/768/1440.');
