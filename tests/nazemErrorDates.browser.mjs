import assert from 'node:assert/strict';
import console from 'node:console';
import { chromium } from 'playwright';
const browser = await chromium.launch();
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 650 } });
    page.on('pageerror', error => console.error(error.message));
    await page.route('**/__nazem-ui-test', route => route.fulfill({contentType:'text/html',body:'<html dir="rtl" class="light"><head></head><body><div id="root"></div></body></html>'}));
    await page.goto('http://localhost:3000/__nazem-ui-test');
    await page.addScriptTag({type:'module',content: "import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true;"});
    await page.waitForFunction(() => globalThis.__vite_plugin_react_preamble_installed__);
    await page.addScriptTag({type:'module',content: `
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import Issues from '/src/components/dashboard/NazemSyncIssuesDialog.jsx';
      import '/src/index.css';
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Issues, {inline:true,open:true,account:{teacherId:1},initialData:{accountIssue:null,studentIssues:[{id:1,jobId:1,issueKind:'job',status:'requires_review',studentName:'طالب الاختبار',message:'تغيّر مقدار ناظم المرتبط بالتقييم المحفوظ.',lastSeenAt:'2026-09-12 14:30'}]}}));
    `});
    await page.locator('time').waitFor();
    assert.equal(await page.locator('time').innerText(),'2026-09-12 14:30');
    assert.equal(await page.locator('time').getAttribute('datetime'),'2026-09-12T14:30');
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    await page.screenshot({path:`outputs/nazem-error-date-${width}.png`});
    await page.close();
  }
} finally { await browser.close(); }
