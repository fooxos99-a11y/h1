import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const images = new Map();
    await page.route('**/api/summit/images**', async (route) => {
      if (route.request().method() === 'POST') {
        const data = route.request().postDataJSON().imageData;
        assert.ok(data.startsWith('data:image/jpeg;base64,') && data.length < 700000);
        const id = String(images.size + 1).repeat(64);
        images.set(id, data);
        return route.fulfill({ json: { id }, status: 201 });
      }
      const id = route.request().url().split('/').at(-1);
      return route.fulfill({ json: { imageData: images.get(id) } });
    });
    await page.goto('http://127.0.0.1:3011/tests/fixtures/summit-scenes.html');
    await page.getByLabel('نهاية مشهد المدينة (كم)').waitFor();
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    await page.getByRole('button', { name: 'إضافة طريق', exact: true }).click();
    await page.getByText('الطريق: 501–750 كم', { exact: true }).waitFor();
    await page.getByText('الطريق: 751–999 كم', { exact: true }).waitFor();
    await page.locator('input[type=file]').nth(0).setInputFiles('public/summit/qassim-road-city-interior.webp');
    await page.waitForFunction(() => globalThis.document.querySelector('img[alt="اختيار صورة المدينة"]')?.src.startsWith('data:'));
    await page.locator('input[type=file]').nth(1).setInputFiles('public/summit/qassim-road-desert.webp');
    await page.waitForFunction(() => globalThis.document.querySelector('img[alt="اختيار صورة الطريق 1"]')?.src.startsWith('data:'));
    await page.getByLabel('العودة إلى منظور الطريق').click();
    await page.getByLabel('معاينة عند').fill('500');
    await page.waitForFunction(() => globalThis.document.querySelector('.qassim-road-scene')?.classList.contains('is-city-interior') && globalThis.document.querySelector('.qassim-road-backdrop')?.src.startsWith('data:'));
    await page.getByLabel('معاينة عند').fill('501');
    await page.waitForFunction(() => !globalThis.document.querySelector('.qassim-road-scene')?.classList.contains('is-city-interior') && globalThis.document.querySelector('.qassim-road-backdrop')?.src.startsWith('data:'));
    await page.getByLabel('نهاية مشهد المدينة (كم)').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `outputs/summit-scenes-${width}.png`, fullPage: true });
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    await page.close();
  }
} finally { await browser.close(); }
