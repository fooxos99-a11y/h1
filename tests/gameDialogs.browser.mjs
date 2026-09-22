import assert from 'node:assert/strict';
import console from 'node:console';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({
  stdin: { contents: `
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import AuctionDialog from './src/components/games/auction/AuctionDialog.jsx';
    import Bank from './src/components/games/letter-hive/LetterHiveQuestionBank.jsx';
    import Question from './src/components/games/letter-hive/LetterHiveQuestionModal.jsx';
    import './src/components/games/auction/auctionGame.css';
    import './src/components/games/letter-hive/letterHive.css';
    function App() {
      const [view, setView] = useState('');
      return <><button id="open" onClick={() => setView(location.hash.slice(1))}>فتح</button>
        {view === 'auction' && <AuctionDialog onClose={() => setView('')}><h2>المزاد</h2><button>داخل النافذة</button></AuctionDialog>}
        {view === 'bank' && <Bank questions={{}} onClose={() => setView('')} onAdd={() => {}} onUpdate={() => {}} onDelete={() => {}} />}
        {view === 'question' && <Question question="سؤال الاختبار" answer="الإجابة" team1="الأول" team2="الثاني" onClose={() => setView('')} onChangeQuestion={() => {}} onShowAnswer={() => {}} onAssign={() => {}} />}
      </>;
    }
    createRoot(document.getElementById('root')).render(<App />);`, resolveDir: root, loader: 'jsx' },
  bundle: true, write: false, outdir: path.join(root, 'tmp/dialog-test'),
  alias: { '@': path.join(root, 'src') }, define: { 'process.env.NODE_ENV': '"development"' },
});
const js = bundle.outputFiles.find((file) => file.path.endsWith('.js')).text;
const css = bundle.outputFiles.find((file) => file.path.endsWith('.css')).text;
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/app.js' ? 'application/javascript' : req.url === '/app.css' ? 'text/css' : 'text/html');
  res.end(req.url === '/app.js' ? js : req.url === '/app.css' ? css : `<!doctype html><html dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>*{box-sizing:border-box}body{margin:0}:root{--font-ui:Arial;--card:0 0% 100%;--primary:260 70% 50%}.sr-only{width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width <= 768 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const view of ['auction', 'bank', 'question']) {
      await page.goto(`http://127.0.0.1:${server.address().port}/#${view}`);
      await page.locator('#open').click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      await page.waitForTimeout(300);
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, `${view} fits ${width}px`);
      assert.ok(bounds.height <= 869, `${view} scrolls within viewport`);
      assert.equal(await dialog.getAttribute('dir'), 'rtl');
      for (let press = 0; press < 12; press += 1) {
        await page.keyboard.press('Tab');
        assert.ok(await dialog.evaluate((element) => element.contains(globalThis.document.activeElement)), 'focus remains in dialog');
      }
      await dialog.click({ position: { x: 10, y: 10 } });
      assert.equal(await dialog.count(), 1, 'inside clicks do not dismiss');
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      await page.waitForFunction(() => globalThis.document.activeElement?.id === 'open');
      assert.equal(await page.locator('#open').evaluate((element) => globalThis.document.activeElement === element), true);
      await page.locator('#open').click();
      await dialog.waitFor();
      await page.waitForTimeout(300);
      if (width <= 768) await page.touchscreen.tap(2, 2);
      else await page.mouse.click(2, 2);
      await dialog.waitFor({ state: 'detached' });
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: 3 game dialogs at 360/768/1440px; RTL, focus trap/return, Escape, inside and outside clicks');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
