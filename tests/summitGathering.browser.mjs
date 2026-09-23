import assert from 'node:assert/strict';
import process from 'node:process';
import { chromium } from 'playwright';
import sharp from 'sharp';

const portrait = await sharp({ create: { width: 450, height: 900, channels: 3, background: '#176b47' } })
  .composite([{ input: await sharp({ create: { width: 450, height: 50, channels: 3, background: '#e8bf5c' } }).png().toBuffer(), top: 0, left: 0 },
    { input: await sharp({ create: { width: 450, height: 50, channels: 3, background: '#e8bf5c' } }).png().toBuffer(), top: 850, left: 0 }]).png().toBuffer();
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    await page.route('**/api/summit/images/**', route => route.fulfill({ json: { imageData: `data:image/png;base64,${portrait.toString('base64')}` } }));
    await page.goto(`${process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3018'}/tests/fixtures/summit-scenes.html?gathering`);
    const photo = page.getByAltText('محطة ملتقى الطلاب', { exact: true });
    await photo.waitFor();
    await page.waitForFunction(() => globalThis.document.querySelector('.qassim-station-backdrop')?.naturalHeight === 900);
    assert.equal(await photo.evaluate(node => globalThis.getComputedStyle(node).objectFit), 'contain');
    assert.equal(await photo.evaluate(node => globalThis.getComputedStyle(node).transform), 'none');
    assert.equal(await page.locator('.qassim-road-dashboard').count(), 1);
    assert.equal(await page.getByText('متوقف في محطة ملتقى الطلاب', { exact: true }).isVisible(), true);
    await page.screenshot({ path: `outputs/station-road-${width}.png` });
    await page.getByRole('button', { name: 'عرض خريطة القصيم من الأعلى' }).click();
    assert.equal(await page.locator('.summit-map-canvas').isVisible(), true);
    assert.equal(await page.locator('.summit-location-marker').count(), 1);
    assert.equal(await page.getByText('متوقف في محطة ملتقى الطلاب', { exact: true }).isVisible(), true);
    await page.screenshot({ path: `outputs/station-map-${width}.png` });
    await page.getByRole('button', { name: 'العودة إلى منظور الطريق' }).focus();
    await page.keyboard.press('Enter');
    await photo.waitFor();
    await page.getByRole('button', { name: 'إلغاء التفعيل للاختبار' }).click();
    assert.equal(await page.locator('.qassim-station-backdrop').count(), 0);
    assert.equal(await page.getByText('متوقف في محطة ملتقى الطلاب', { exact: true }).count(), 0);
    assert.equal(await page.locator('.qassim-road-scene').count(), 1);
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    await page.close();
  }
} finally { await browser.close(); }
