import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';

const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3011';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Local only');
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 950 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => route.fulfill({ json: {} }));
    await page.goto(`${base}/tests/fixtures/summit-resume.html`);
    await page.getByRole('button', { name: 'متابعة الطريق', exact: true }).waitFor();
    // Close/reopen before acknowledgement; the seen-notice flag must not trap the student at zero.
    await page.reload();
    const proceed = page.getByRole('button', { name: 'متابعة الطريق', exact: true });
    await proceed.waitFor({ timeout: 5000 });
    assert.ok((await proceed.boundingBox()).height >= 44);
    await proceed.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => globalThis.summitResume.saved === 120, { timeout: 5000 });
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    await page.screenshot({ path: `outputs/summit-resume-${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally { await browser.close(); }
console.log('Summit zero-position resume passed at 360/768/1440px.');
