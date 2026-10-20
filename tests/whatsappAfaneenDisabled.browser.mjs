import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import process from 'node:process';

const base = process.env.WHATSAPP_AFANEEN_BASE || 'http://127.0.0.1:3023';
const output = `outputs/whatsapp-recovery/${base.startsWith('https:') ? 'afaneen-disabled-live' : 'afaneen-disabled'}`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 950 }, serviceWorkers: 'block' });
    const errors = [];
    const requests = [];
    page.on('response', (response) => requests.push({ path: new URL(response.url()).pathname, status: response.status() }));
    let whatsappCalls = 0;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (!path.includes('api')) return route.continue();
      if (path.includes('/whatsapp')) whatsappCalls += 1;
      const data = path.endsWith('/site-config') ? { key: 'afaneen', features: { whatsapp: false }, whatsappUrl: '' }
        : path.includes('settings') ? { attendanceManualEnabled: true, activityLogEnabled: true, automaticAbsenceMessageEnabled: true, attendanceAbsentTemplate: 'synthetic-only' }
          : [];
      return route.fulfill({ status: 200, json: data });
    });
    await page.addInitScript(() => {
      globalThis.localStorage.setItem('wajeh_role', 'manager');
      globalThis.localStorage.setItem('wajeh_token', 'synthetic-local-only');
    });
    await page.goto(`${base}/wajeh`, { waitUntil: 'networkidle' });
    await page.waitForURL('**/dashboard');
    const menu = page.getByRole('button', { name: 'فتح القائمة الجانبية', exact: true });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole('button', { name: 'الإعدادات', exact: true }).last().click();
    await page.waitForLoadState('networkidle');
    assert.equal(await page.getByText('الإرسال عبر الواتساب', { exact: true }).count(), 0);
    assert.equal(await page.getByText('رسائل الغياب', { exact: true }).count(), 0);
    assert.equal(await page.getByText('رسالة الغياب التلقائية', { exact: true }).count(), 0);
    assert.equal(whatsappCalls, 0);
    await page.screenshot({ path: `${output}/settings-${width}.png` });
    await page.getByText('محفوظ تلقائياً', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
    await writeFile(`${output}/request-diagnostic.json`, JSON.stringify(requests, null, 2));
    assert.equal(await page.getByText('تعذر تحميل الإعدادات', { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
    await page.screenshot({ path: `${output}/settings-${width}.png` });
    await page.goto(`${base}/contact`, { waitUntil: 'networkidle' });
    assert.ok((await page.locator('body').innerText()).length > 50);
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('a[href*="wa.me"]').count(), 0);
    assert.deepEqual(errors, []);
    results.push({ width, dashboardRedirect: true, automaticWhatsAppSettingsHidden: true, whatsappNavigationHidden: true, whatsappCalls, publicContactAndHomePassed: true, browserErrors: errors });
    await page.close();
  }
} finally { await browser.close(); }
await writeFile(`${output}/proof.json`, JSON.stringify({ results, realMessages: 0 }, null, 2));
globalThis.console.log(JSON.stringify({ cases: results.length, passed: true, realMessages: 0 }));
