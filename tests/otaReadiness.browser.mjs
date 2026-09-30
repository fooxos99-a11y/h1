/* global window, document, console */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { Buffer } from 'node:buffer';

// Exercise the real readiness observer in Chromium; only native device APIs are mocked.
const bundle = await build({
  entryPoints: ['src/lib/nativeOta.js'], bundle: true, write: false, format: 'iife', globalName: 'OtaReadiness',
  define: { __OTA_CONFIG__: JSON.stringify({ enabled: false }) },
  plugins: [{
    name: 'synthetic-capacitor',
    setup(builder) {
      builder.onResolve({ filter: /^@capacitor\/core$|^@capawesome\/capacitor-live-update$|^@capacitor\/app$/ }, (args) => ({ path: args.path, namespace: 'native-mock' }));
      builder.onLoad({ filter: /.*/, namespace: 'native-mock' }, ({ path }) => ({ contents: path === '@capacitor/core'
        ? 'export const Capacitor = { isNativePlatform: () => window.nativePlatform, isPluginAvailable: () => true };'
        : path === '@capacitor/app'
          ? 'export const App = { addListener: async () => ({ remove() {} }) };'
          : 'export const LiveUpdate = { ready: async () => { window.readyCalls++; } };' }));
    },
  }],
});
const browser = await chromium.launch({ headless: true });
try {
  for (const scenario of ['healthy', 'loading', 'error-boundary', 'startup-error', 'web']) {
    const page = await browser.newPage();
    await page.setContent('<div id="app-root"><main>synthetic application screen</main></div>');
    await page.evaluate((native) => { window.nativePlatform = native; window.readyCalls = 0; }, scenario !== 'web');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate((kind) => {
      const root = document.getElementById('app-root');
      if (kind === 'loading') root.firstElementChild.setAttribute('data-loading-indicator', 'screen');
      if (kind === 'error-boundary') root.firstElementChild.setAttribute('data-app-error', '');
      window.OtaReadiness.observeNativeOtaReadiness(root);
      if (kind === 'startup-error') window.OtaReadiness.markNativeStartupFailed();
    }, scenario);
    await page.waitForTimeout(1800);
    assert.equal(await page.evaluate(() => window.readyCalls), scenario === 'healthy' ? 1 : 0, scenario);
    if (scenario === 'loading') {
      await page.evaluate(() => { document.getElementById('app-root').innerHTML = '<main>ready offline screen</main>'; });
      await page.waitForFunction(() => window.readyCalls === 1);
    }
    await page.close();
    console.info(`OTA readiness: ${scenario} passed`);
  }

  const keys = generateKeyPairSync('rsa', { modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  const config = { enabled: true, appId: 'test.ota.synthetic', runtime: 'a'.repeat(64),
    baseUrl: 'https://updates.example.test', publicKey: keys.publicKey };
  const payload = JSON.stringify({ schema: 1, action: 'update', issuedAt: Date.now(), appId: config.appId,
    runtime: config.runtime, bundleId: 'b'.repeat(64), checksum: 'b'.repeat(64), signature: Buffer.from('synthetic-native-signature').toString('base64'),
    url: `${config.baseUrl}/bundles/${config.runtime}/${'b'.repeat(64)}.zip` });
  const envelope = { payload, signature: sign('sha256', Buffer.from(payload), keys.privateKey).toString('base64') };
  const mandatory = await build({
    entryPoints: ['src/lib/nativeOta.js'], bundle: true, write: false, format: 'iife', globalName: 'OtaReadiness',
    define: { __OTA_CONFIG__: JSON.stringify(config) },
    plugins: [{ name: 'synthetic-native-update', setup(builder) {
      builder.onResolve({ filter: /^@capacitor\/core$|^@capawesome\/capacitor-live-update$|^@capacitor\/app$/ }, (args) => ({ path: args.path, namespace: 'mandatory-mock' }));
      builder.onLoad({ filter: /.*/, namespace: 'mandatory-mock' }, ({ path }) => ({ contents: path === '@capacitor/core'
        ? 'export const Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true };'
        : path === '@capacitor/app'
          ? 'export const App = { addListener: async () => ({ remove() {} }) };'
          : `export const LiveUpdate = {
              ready: async () => { window.readyCalls++; },
              getChannel: async () => ({ channel: '${config.runtime}' }),
              getCurrentBundle: async () => ({ bundleId: window.currentBundle }),
              getBlockedBundles: async () => ({ bundleIds: [] }),
              getDownloadedBundles: async () => ({ bundleIds: [] }),
              downloadBundle: async () => { window.downloadCalls++; await new Promise(resolve => { window.finishDownload = resolve; }); },
              setNextBundle: async () => { window.stageCalls++; },
              reload: async () => { window.reloadCalls++; }
            };` }));
    } }],
  });
  const html = await readFile('index.html', 'utf8');
  const styles = html.match(/<style>([\s\S]*?)<\/style>/)[1] + await readFile('src/styles/loading-spinner.css', 'utf8');
  const logo = await readFile('public/branding/rawasi/alhabib-map-color-320.webp');
  const loader = html.match(/<output class="boot-loader"[\s\S]*?<\/output>/)[0];
  for (const scenario of ['download', 'offline', 'current', 'bad-signature']) {
    const page = await browser.newPage({ viewport: { width: scenario === 'download' ? 360 : 1440, height: 800 } });
    await page.route('https://ota-test.example/**', route => route.fulfill({ contentType: 'text/html', body:
      `<html class="app-ready" lang="ar" dir="rtl"><head><style>${styles}</style></head><body>${loader}<div id="app-root"><button id="action">متابعة</button></div></body></html>` }));
    await page.route('https://ota-test.example/branding/rawasi/alhabib-map-color-320.webp', route => route.fulfill({ contentType: 'image/webp', body: logo }));
    await page.goto('https://ota-test.example/');
    await page.evaluate(({ kind, signed }) => {
      window.readyCalls = window.downloadCalls = window.stageCalls = window.reloadCalls = window.clicks = 0;
      window.currentBundle = kind === 'current' ? 'b'.repeat(64) : null;
      document.getElementById('action').addEventListener('click', () => window.clicks++);
      window.fetch = async () => {
        if (kind === 'offline') throw new Error('synthetic offline');
        return { ok: true, text: async () => JSON.stringify(kind === 'bad-signature' ? { ...signed, signature: 'invalid' } : signed) };
      };
    }, { kind: scenario, signed: envelope });
    await page.addScriptTag({ content: mandatory.outputFiles[0].text });
    await page.evaluate(() => window.OtaReadiness.observeNativeOtaReadiness(document.getElementById('app-root')));
    assert.equal(await page.locator('#app-root').evaluate(root => root.inert), true);
    assert.notEqual(await page.locator('.boot-loader').evaluate(node => window.getComputedStyle(node).display), 'none');
    await page.waitForFunction(() => window.readyCalls === 1);
    if (scenario === 'download') {
      await page.waitForFunction(() => window.downloadCalls === 1);
      await page.keyboard.press('Tab');
      assert.notEqual(await page.evaluate(() => document.activeElement.id), 'action');
      const button = await page.locator('#action').boundingBox();
      await page.mouse.click(button.x + 5, button.y + 5);
      assert.equal(await page.evaluate(() => window.clicks), 0);
      assert.equal(await page.evaluate(() => window.reloadCalls), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await mkdir('tmp', { recursive: true });
      await page.screenshot({ path: 'tmp/ota-mandatory-360.png' });
      await page.setViewportSize({ width: 1440, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await page.screenshot({ path: 'tmp/ota-mandatory-1440.png' });
      await page.evaluate(() => window.finishDownload());
      await page.waitForFunction(() => window.reloadCalls === 1);
      assert.equal(await page.evaluate(() => window.stageCalls), 1);
      assert.equal(await page.locator('#app-root').evaluate(root => root.inert), true);
    } else {
      await page.waitForFunction(() => !document.getElementById('app-root').inert);
      assert.equal(await page.evaluate(() => window.reloadCalls), 0);
      assert.equal(await page.locator('.boot-loader').evaluate(node => window.getComputedStyle(node).display), 'none');
      await page.locator('#action').click();
      assert.equal(await page.evaluate(() => window.clicks), 1);
    }
    await page.close();
    console.info(`Mandatory OTA startup: ${scenario} passed`);
  }
} finally {
  await browser.close();
}
