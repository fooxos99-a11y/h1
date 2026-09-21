import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('boot and React share the cyan spinner and never render a boot card or native spinner', async () => {
  const [html, react, style, native] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ui/loading-spinner.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/loading-spinner.css', import.meta.url), 'utf8'),
    readFile(new URL('../capacitor.config.json', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /rel="stylesheet" href="\/src\/styles\/loading-spinner.css"/);
  assert.match(html, /<span class="loading-spinner--screen"/);
  assert.doesNotMatch(html, /boot-loader__panel|boot-panel|backdrop-filter|box-shadow|boot-primary/);
  assert.match(react, /lg: 'loading-spinner--screen'/);
  assert.match(style, /color: #0aa3b4/);
  assert.match(style, /background: transparent/);
  assert.equal(JSON.parse(native).plugins.SplashScreen.showSpinner, false);
});
