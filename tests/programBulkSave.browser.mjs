import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch();
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:3011/tests/fixtures/program-bulk.html');
    await page.getByRole('button', { name: 'دخول', exact: true }).click();
    await page.getByRole('button', { name: 'تسجيل النقاط', exact: true }).click();
    await page.getByRole('checkbox', { name: 'تحديد طالب 1', exact: true }).check();
    await page.getByRole('checkbox', { name: 'تحديد طالب 3', exact: true }).check();
    await page.getByLabel('نقاط المحددين', { exact: true }).fill('75');
    await page.getByRole('button', { name: 'حفظ', exact: true }).click();
    await page.getByText('المسجل:').first().waitFor();
    assert.deepEqual(JSON.parse(await page.getByLabel('الدفعة المحفوظة').textContent()), [
      { studentId: 1, points: 75 }, { studentId: 3, points: 75 },
    ]);
    assert.equal(await page.getByRole('button', { name: /تطبيق للمحددين|حفظ جماعي/ }).count(), 0);
    assert.ok(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth));
    await page.getByRole('button', { name: 'إغلاق', exact: true }).click();
    await page.getByRole('button', { name: 'تسجيل النقاط', exact: true }).click();
    await page.getByLabel('نقاط المحددين', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally { await browser.close(); }
