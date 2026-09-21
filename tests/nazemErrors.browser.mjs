import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    for (const width of [360, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto('http://127.0.0.1:3000/tests/fixtures/nazem-errors.html');
      await page.getByText('المعلم الأول', { exact: true }).waitFor();
      assert.equal(await page.getByText('خطأ المعلم الأول', { exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'التعارضات', exact: true }).count(), 0);
      for (const name of ['المعلم الأول', 'المعلم الثاني']) {
        const card = page.getByText(name, { exact: true }).locator('../..');
        assert.deepEqual(await card.getByRole('button').allTextContents(), ['استيراد', 'إلغاء الربط']);
      }
      await page.getByRole('button', { name: 'الأخطاء', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByText('خطأ المعلم الثاني', { exact: true }).waitFor();
      assert.equal(await dialog.getByText('خطأ المعلم الأول', { exact: true }).count(), 1);
      assert.equal(await dialog.getByText('خطأ تسميع 2', { exact: true }).count(), 1);
      const retry = dialog.getByRole('button', { name: 'إعادة المحاولة', exact: true }).first();
      await retry.click({ trial: true });
      assert.ok((await retry.boundingBox()).height >= 44);
      await retry.click();
      await dialog.getByRole('button', { name: 'تمت الجدولة' }).waitFor();
      assert.deepEqual(await page.evaluate(() => globalThis.errorFixture.retries), [1]);
      assert.equal(await dialog.getByRole('button', { name: 'تعديل بيانات الربط' }).count(), 1);
      assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth), true);
      await dialog.getByRole('button', { name: 'إغلاق', exact: true }).click();
      await page.close();
    }
  } finally { await browser.close(); }
}
globalThis.console.log('Central errors and account actions passed in Chromium/WebKit at 360/768/1440px.');
