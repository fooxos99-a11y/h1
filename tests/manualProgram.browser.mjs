import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch();
try {
 for (const width of [360, 768, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto('http://127.0.0.1:3011/tests/fixtures/manual-program.html');
  await page.locator('#program-title').fill('دورة بصائر');
  await page.locator('#program-points').fill('100');
  await page.locator('#program-content').fill('وصف الدورة');
  await page.getByRole('switch', { name: 'بدون أسئلة — تسجيل النقاط يدويًا' }).click();
  assert.equal(await page.getByRole('heading', { name: 'الأسئلة', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'حفظ', exact: true }).click();
  const input = page.getByLabel('طالب تجريبي', { exact: true });
  await input.fill('101');
  assert.ok(await page.getByRole('button', { name: 'حفظ', exact: true }).isDisabled());
  await input.fill('65');
  await page.getByRole('button', { name: 'حفظ', exact: true }).click();
  await page.getByText(/المسجل:/).waitFor();
  assert.ok(await page.getByRole('button', { name: 'حفظ', exact: true }).isDisabled());
  assert.ok(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth));
  await page.screenshot({ path: `outputs/manual-program-${width}.png` });
  await page.close();
 }
} finally { await browser.close(); }
