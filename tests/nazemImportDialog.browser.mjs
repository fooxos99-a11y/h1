import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    for (const width of [360, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto('http://127.0.0.1:3000/tests/fixtures/nazem-errors.html');
      await page.getByRole('button', { name: 'استيراد', exact: true }).first().waitFor();
      await page.evaluate(async () => {
        const { nazemIntegrationApi: api } = await import(new globalThis.URL('src/services/nazemIntegrationApi.js', globalThis.location.origin).href);
        const preview = { teacher: {}, committees: [], localStudents: [], candidates: [
          { id: 13, nazemStudentName: 'سليمان عبدالعزيز', circleName: 'حلقة الاختبار', plans: [] },
        ] };
        globalThis.importFixture = { api, preview };
        api.prepareImportData = (_id, { signal }) => new Promise((_resolve, reject) => {
          globalThis.importFixture.fail = () => reject(new Error('تعذر تحديث ناظم'));
          signal.addEventListener('abort', () => { globalThis.importFixture.aborted = true; reject(new Error('cancelled')); });
        });
        api.getImportPreview = async () => preview;
        api.getConflicts = async () => [];
      });
      await page.getByRole('button', { name: 'استيراد', exact: true }).first().click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      await page.waitForFunction(() => globalThis.importFixture.fail);
      await page.evaluate(() => globalThis.importFixture.fail());
      await dialog.getByText('سليمان عبدالعزيز', { exact: true }).waitFor();
      await dialog.getByText('تعذر التحقق من الخطة', { exact: true }).waitFor();
      assert.equal(await dialog.getByText('لم تُكتشف خطة', { exact: true }).count(), 0);
      assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
      await page.evaluate(() => {
        const fixture = globalThis.importFixture;
        fixture.api.prepareImportData = async () => ({ preview: { ...fixture.preview, candidates: [
          { ...fixture.preview.candidates[0], plans: [{ id: 7, status: 'discovered' }] },
        ] }, conflicts: [], mode: 'new', committeeId: '', newCommitteeName: 'حلقة الاختبار', refreshResult: null });
      });
      await dialog.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
      await dialog.getByText('خطة ناظم جاهزة للاستيراد', { exact: true }).waitFor();
      assert.equal(await dialog.getByText('تعذر تحديث ناظم', { exact: true }).count(), 0);
      await page.close();
    }
  } finally { await browser.close(); }
}
globalThis.console.log('Import opens immediately, retains cached students on refresh failure, and retries successfully in Chromium/WebKit at 360/768/1440px.');
