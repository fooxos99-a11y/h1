import assert from 'node:assert/strict';
import process from 'node:process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.WHATSAPP_PREVIEW_BASE || 'http://127.0.0.1:3011';
const output = process.env.WHATSAPP_PREVIEW_OUTPUT || 'outputs/whatsapp-recovery';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const width of [360, 768, 1440]) {
    for (const mode of ['suspended', 'loading', 'error']) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width === 360 });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/*', (route) => new globalThis.URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
      await page.goto(`${base}/tests/fixtures/whatsapp-recovery.html?mode=${mode}`, { timeout: 90_000 });
      const open = page.getByRole('button', { name: 'باركود واتساب', exact: true });
      await open.waitFor();
      assert.equal(await page.evaluate(() => globalThis.whatsappFixture.calls.connect), 0);
      await open.click();
      await page.getByRole('dialog').waitFor();
      await page.getByRole('dialog').evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
      await page.waitForFunction(() => globalThis.whatsappFixture.calls.connect === 1);
      if (mode === 'suspended') await page.getByText('واتساب مرتبط ويعمل عند الإرسال.', { exact: true }).waitFor();
      if (mode === 'loading') {
        await page.waitForFunction(() => globalThis.whatsappFixture.calls.observe >= 1);
        assert.equal(await page.evaluate(() => globalThis.whatsappFixture.calls.connect), 1);
      }
      if (mode === 'error') await page.getByText('تعذر تجهيز باركود واتساب.', { exact: true }).waitFor();
      const metrics = await page.evaluate(() => {
        const dialog = globalThis.document.querySelector('[role="dialog"]');
        const box = dialog.getBoundingClientRect();
        return { overflow: globalThis.document.documentElement.scrollWidth > globalThis.innerWidth, left: box.left, right: box.right, direction: globalThis.getComputedStyle(dialog).direction, font: globalThis.getComputedStyle(dialog).fontFamily };
      });
      assert.equal(metrics.overflow, false);
      assert.ok(metrics.left >= -1 && metrics.right <= width + 1, JSON.stringify({ width, mode, ...metrics }));
      assert.equal(metrics.direction, 'rtl');
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `${output}/whatsapp-${width}-${mode}.png` });
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      results.push({ width, mode, ...metrics, explicitConnectOnly: true, noRealMessages: true });
      await page.close();
    }
  }
} finally { await browser.close(); }
await writeFile(`${output}/browser-proof.json`, JSON.stringify({ results }, null, 2));
globalThis.console.log(JSON.stringify({ cases: results.length, passed: true }));
