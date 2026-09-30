/* global window, document, console */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

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
} finally {
  await browser.close();
}
