import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const output = 'C:/Users/RAIQ/Desktop/الموارد البشرية/outputs/whatsapp-recovery';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const width of [360, 768, 1440]) for (const mode of ['suspended', 'loading', 'error']) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) => new globalThis.URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.goto(`http://127.0.0.1:3024/?mode=${mode}`);
    await page.getByRole('dialog').waitFor({ timeout: 5000 }).catch((error) => { throw new Error(`${error.message}; browser errors: ${JSON.stringify(errors)}`); });
    await page.getByRole('dialog').evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
    await page.waitForFunction(() => globalThis.whatsappFixture.calls.observe >= 2);
    assert.equal(await page.evaluate(() => globalThis.whatsappFixture.calls.connect), 1);
    if (mode === 'suspended') await page.getByText('مرتبط ويعمل عند الإرسال', { exact: true }).waitFor();
    if (mode === 'error') await page.getByText('تعذر تجهيز باركود واتساب.', { exact: true }).waitFor();
    const metrics = await page.getByRole('dialog').evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, direction: globalThis.getComputedStyle(element).direction, overflow: globalThis.document.documentElement.scrollWidth > globalThis.innerWidth };
    });
    assert.equal(metrics.overflow, false);
    assert.ok(metrics.left >= -1 && metrics.right <= width + 1, JSON.stringify(metrics));
    assert.equal(metrics.direction, 'rtl');
    const clippedLabels = await page.getByRole('dialog').evaluate((element) => [...element.querySelectorAll('b, p, small')].filter((label) => label.scrollWidth > label.clientWidth + 1).length);
    assert.equal(clippedLabels, 0);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${output}/modal-${width}-${mode}.png` });
    await page.getByRole('button', { name: 'إغلاق', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    results.push({ width, mode, connectOnlyOnce: true, ...metrics });
    await page.close();
  }
} finally { await browser.close(); }
await writeFile(`${output}/modal-browser-proof.json`, JSON.stringify({ results }, null, 2));
globalThis.console.log(JSON.stringify({ cases: results.length, passed: true }));
