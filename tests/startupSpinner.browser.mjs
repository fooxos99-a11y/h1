import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch();
const properties = ['width','height','color','borderTopColor','borderRightWidth','backgroundColor','boxShadow'];
try {
  for (const width of [360,768,1440]) {
    const page = await browser.newPage({viewport:{width,height:800}});
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/src/main.jsx', async route => { await gate; await route.continue(); });
    await page.goto('http://localhost:3000/',{waitUntil:'commit'});
    const boot = page.locator('.boot-loader .loading-spinner--screen');
    await boot.waitFor();
    await page.waitForFunction(() => globalThis.getComputedStyle(globalThis.document.querySelector('.loading-spinner--screen')).width === '36px');
    const initial = await boot.evaluate((el,keys) => Object.fromEntries(keys.map(key => [key,globalThis.getComputedStyle(el)[key]])), properties);
    assert.equal(initial.color,'rgb(10, 163, 180)');
    assert.equal(initial.backgroundColor,'rgba(0, 0, 0, 0)');
    assert.equal(await page.locator('.boot-loader__panel').count(),0);
    await page.screenshot({path:`outputs/startup-spinner-${width}.png`});
    release();
    await page.waitForFunction(() => globalThis.document.documentElement.classList.contains('app-ready'));
    await page.addScriptTag({type:'module',content:`
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import Spinner from '/src/components/ui/loading-spinner.jsx';
      const host=document.createElement('div'); host.id='spinner-test'; document.body.append(host);
      ReactDOM.createRoot(host).render(React.createElement(Spinner,{size:'lg'}));
    `});
    const react = page.locator('#spinner-test .loading-spinner--screen');
    await react.waitFor();
    const rendered = await react.evaluate((el,keys) => Object.fromEntries(keys.map(key => [key,globalThis.getComputedStyle(el)[key]])), properties);
    assert.deepEqual(rendered,initial);
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    await page.close();
  }
} finally { await browser.close(); }
