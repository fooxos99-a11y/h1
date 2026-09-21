import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { chromium } from 'playwright';

const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3011';
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw new Error('Local server required');
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    const requests = [];
    const reason = 'لم يظهر الطالب في متابعة ناظم لأن خطته كانت مغلقة.';
    await page.route('**/api/**', route => {
      requests.push({ url: route.request().url(), method: route.request().method() });
      return route.fulfill({ json: route.request().method() === 'POST' ? { ok: true } : [{ id: 7, studentName: 'طالب الاختبار', taskType: 'memorization', firstFailureReason: reason }] });
    });
    await page.goto(`${base}/tests/fixtures/recitation-retries.html`);
    const retry = page.getByRole('button', { name: 'إعادة الإرسال', exact: true });
    await retry.waitFor();
    await page.getByText(reason, { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth), true);
    assert.ok((await retry.boundingBox()).height >= 44);
    await page.screenshot({ path: `outputs/recitation-retries-${width}.png` });
    await retry.click();
    await retry.waitFor({ state: 'detached' });
    assert.equal(requests.filter(request => request.method === 'POST').length, 1);
    assert.ok(requests.every(request => request.url.includes('/recitation-retries')));
    await page.close();
  }
  console.info('Retry reason and saved-result resend passed at 360, 768 and 1440px.');
} finally { await browser.close(); }
