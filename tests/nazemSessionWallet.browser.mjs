import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
const base = process.env.BROWSER_BASE_URL || 'http://127.0.0.1:3011';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Local fixture only');
const browser = await chromium.launch({ headless: true });
await mkdir('outputs/nazem-session-wallet', { recursive: true });
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 950 }, serviceWorkers: 'block' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => route.fulfill({ json: {} }));
    await page.goto(`${base}/tests/fixtures/nazem-session-wallet.html`);
    await page.getByRole('article').waitFor();
    assert.equal(await page.getByRole('article').count(), 1);
    assert.equal(await page.getByText('أُرسل إلى ناظم', { exact: true }).count(), 2);
    await page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => globalThis.sessionWalletFixture.retries), [3]);
    await page.screenshot({ path: `outputs/nazem-session-wallet/log-${width}.png`, fullPage: true });
    await page.goto(`${base}/tests/fixtures/nazem-session-wallet.html?wallet`);
    await page.getByRole('button', { name: 'تعديل محمد', exact: true }).click();
    await page.getByRole('combobox', { name: 'تعديل', exact: true }).click();
    await page.getByRole('option', { name: 'الرصيد فقط', exact: true }).click();
    const balance = page.getByRole('spinbutton', { name: 'الرصيد', exact: true });
    assert.equal(await balance.inputValue(), '40');
    await balance.fill('60');
    await page.getByRole('textbox', { name: /سبب تعديل/ }).fill('اختبار الرصيد');
    await page.screenshot({ path: `outputs/nazem-session-wallet/wallet-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'حفظ', exact: true }).click();
    const saved = await page.evaluate(() => globalThis.sessionWalletFixture.saved);
    assert.equal(saved[0].pointTarget, 'balance');
    assert.equal(saved[0].storeBalance, 60);
    assert.equal(saved[0].expectedStoreBalance, 40);
    assert.equal(saved[0].points, 100);
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Session grouping, retry isolation and wallet-only UI passed at 360/768/1440px.');
} finally { await browser.close(); }
