import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.BROWSER_BASE_URL || 'http://127.0.0.1:3011';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Local fixture only');
const browser = await chromium.launch({ headless: true });
try {
  for (const role of ['manager', 'teacher']) for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.goto(`${base}/tests/fixtures/nazem-reconciliation.html?role=${role}`);
    await page.getByRole('combobox', { name: 'نوع التقرير' }).click();
    await page.getByRole('option', { name: 'مطابقة ناظم', exact: true }).click();
    const region = page.getByRole('region', { name: 'مطابقة ناظم' });
    await region.locator('article').first().waitFor();
    assert.equal(await region.locator('article').count(), 3);
    await region.getByRole('combobox', { name: 'فرز المطابقة' }).click();
    await page.getByRole('option', { name: 'أكبر فرق' }).click();
    assert.match(await region.locator('article').first().innerText(), /خالد/);
    await region.getByRole('textbox').fill('أحمد');
    assert.equal(await region.locator('article').count(), 1);
    await region.getByRole('textbox').fill('لا يوجد');
    await region.getByRole('status').waitFor();
    await region.getByRole('textbox').fill('');
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    assert.ok(await region.getByRole('textbox').evaluate((element) => element.getBoundingClientRect().height >= 44));
    assert.equal(await region.evaluate((element) => globalThis.getComputedStyle(element).direction), 'rtl');
    await page.screenshot({ path: `outputs/recitation-reliability/reconciliation-${role}-${width}.png`, fullPage: true });
    await page.evaluate(() => { globalThis.reconciliationFixture.fail = true; });
    await page.getByRole('button', { name: 'تحديث التقرير' }).click();
    await page.getByText('تعذر جلب تقرير المطابقة', { exact: true }).waitFor();
    await page.evaluate(() => { globalThis.reconciliationFixture.fail = false; });
    await page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
    await region.locator('article').first().waitFor();
    await page.close();
  }
  console.log('Reconciliation report: navigation, filters, sorting, errors, RTL and 360/768/1440px passed.');
} finally { await browser.close(); }
