import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
const privateAccess = JSON.parse(readFileSync(0, 'utf8'));
const output = 'outputs/whatsapp-recovery/live';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const results = [];
const sites = [['madarij','https://mdarj.net/'],['rboh','https://rboh.cc/'],['nukhab','https://nokhab.cc/n5b/'],['afaneen','https://afnan.cc/'],['mward','https://basaer.us/mward/employee/login'],['rsalh','https://161.97.171.108.sslip.io/rsalh']];
try {
  for (const [site,url] of sites) {
    for (const width of [360,1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, ...(site === 'rsalh' ? { httpCredentials: { username: privateAccess.username, password: privateAccess.password, origin: 'https://161.97.171.108.sslip.io' } } : {}) });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      // Do not open a production WhatsApp session or send a request through its proxy.
      await page.route('**/*', (route) => {
        const request = route.request();
        if (request.url().includes('/api/whatsapp')) return route.fulfill({ status: 403, json: { message: 'Live sending is excluded from verification.' } });
        if (!['GET','HEAD','OPTIONS'].includes(request.method())) return route.abort();
        return route.continue();
      });
      const started = Date.now();
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.waitForLoadState('networkidle', { timeout: 25_000 });
      await page.waitForFunction(() => (globalThis.document.body?.innerText || '').trim().length > 20, null, { timeout: 20_000 });
      if (['madarij','rboh','nukhab','mward'].includes(site)) await page.locator('input').first().waitFor({ state: 'visible', timeout: 35_000 });
      if (['madarij','rboh','nukhab','mward'].includes(site)) await page.locator('input:visible').first().click({ trial: true, timeout: 35_000 });
      await page.waitForFunction(() => ![...globalThis.document.querySelectorAll('.screen-loading-surface')].some((element) => {
        const style = globalThis.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > .01 && element.getBoundingClientRect().width > 0;
      }), null, { timeout: 35_000 });
      await page.evaluate(() => globalThis.document.fonts.ready);
      const renderedMs = Date.now() - started;
      await page.screenshot({ path: `${output}/${site}-${width}.png`, fullPage: false });
      const text = await page.locator('body').innerText();
      const metrics = await page.evaluate(() => ({ overflow: globalThis.document.documentElement.scrollWidth > globalThis.innerWidth, direction: globalThis.getComputedStyle(globalThis.document.body).direction }));
      assert.equal(response.status(), 200, site);
      assert.ok(!text.includes('تعذر إكمال التحميل'), site);
      assert.ok(!text.includes('Application error: a client-side exception'), site);
      assert.deepEqual(errors, [], JSON.stringify({ site, width, errors }));
      results.push({ site, url, width, status: response.status(), renderedMs, ...metrics, actualProductionPage: true, whatsappTransportBlocked: true, browserErrors: errors });
      await writeFile(`${output}/proof.json`, JSON.stringify({ results }, null, 2));
      globalThis.console.log(JSON.stringify({ site, width, renderedMs, passed: true }));
      await page.close();
    }
  }
} finally { await browser.close(); }
await writeFile(`${output}/proof.json`, JSON.stringify({ results }, null, 2));
globalThis.console.log(JSON.stringify({ livePages: results.length, passed: true, realMessages: 0 }));
