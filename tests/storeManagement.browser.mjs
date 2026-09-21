import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { URL } from 'node:url';

const browser = await chromium.launch({ headless: true });
try {
  for (const width of [360, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    let fulfilled = false;
    await context.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let body = [];
      if (path.endsWith('/store/configuration')) body = { storeEnabled: true, pointsSystemEnabled: true, storePurchaseDeductsRanking: false };
      if (path.endsWith('/store/products')) body = { products: [] };
      if (path.endsWith('/store/orders')) body = [{ id: 1, studentName: 'طالب اختبار', productName: 'منتج', pointsPrice: 75, fulfilled }];
      if (path.includes('/store/orders/1') && route.request().method() === 'PATCH') { fulfilled = true; body = { ok: true }; }
      await route.fulfill({ json: body });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:3000/tests/fixtures/store-management.html');
    await page.getByRole('button', { name: 'طلبات الطلاب' }).click();
    await page.getByRole('checkbox', { name: 'تحديد الطلب كمكتمل' }).click();
    await page.getByText('لا توجد طلبات طلاب.').waitFor();
    assert.equal(fulfilled, true);
    await page.reload();
    await page.getByRole('button', { name: 'طلبات الطلاب' }).click();
    await page.getByText('لا توجد طلبات طلاب.').waitFor();
    if (width < 768) await page.getByRole('button', { name: 'إعدادات المتجر' }).click();
    await page.getByRole('switch', { name: 'تفعيل المتجر' }).waitFor();
    assert.equal(await page.getByRole('switch').count(), 2);
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
    await page.screenshot({ path: `outputs/store-settings-${width}.png` });
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally { await browser.close(); }
