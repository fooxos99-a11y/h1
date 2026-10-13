import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';

const base = process.env.PROGRAM_ATTACHMENT_TEST_URL || 'http://127.0.0.1:3033/tests/fixtures/program-attachments.html';
const arabicFont = await readFile('public/fonts/cairo/cairo-400.ttf');
const scannedImage = await sharp({ create: { width: 800, height: 400, channels: 3, background: '#c24b3e' } }).jpeg().toBuffer();
const pdf = await new Promise(resolve => {
  const document = new PDFDocument();
  const chunks = [];
  document.on('data', chunk => chunks.push(chunk));
  document.on('end', () => resolve(Buffer.concat(chunks)));
  document.image(scannedImage, 50, 50, { width: 400, height: 200 });
  document.fillColor('black').text('FIRST SECTION', 50, 300);
  document.font(arabicFont).text('القسم الأول: دروس مهمة لعامة الأمة', 50, 350);
  document.addPage().font('Helvetica').text('SECOND PAGE', 50, 300);
  document.end();
});
const attachment = { type: 'file', fileName: 'القسم الاول.pdf', mimeType: 'application/pdf', value: `data:application/pdf;base64,${pdf.toString('base64')}` };
const program = { id: 1, title: 'برنامج', status: 'open', contents: [], questions: [], sectionsEnabled: true,
  sections: [{ id: 2, title: 'القسم الأول', status: 'open', contents: [attachment], questions: [] }] };
await mkdir('outputs/news-pdf-followup', { recursive: true });
const browserType = process.env.PROGRAM_ATTACHMENT_BROWSER === 'webkit' ? webkit : chromium;
const browser = await browserType.launch({ headless: true });
try {
  for (const width of [360, 768, 1440]) {
    for (const failure of (process.env.PDF_RECOVERY_EXPECT_FAILURE ? ['worker-blocked', 'native-viewer'] : ['worker-blocked', 'worker-error', 'native-viewer'])) {
      console.log(`${browserType.name()} ${failure} ${width}`);
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') console.log(`${failure}: ${message.text().slice(0, 200)}`); });
      await page.addInitScript(({ program, failure }) => {
        globalThis.localStorage.setItem('program_attachment_fixture', JSON.stringify(program));
        globalThis.pdfRecoveryCalls = [];
        if (failure.startsWith('worker-')) {
          globalThis.Worker = class extends globalThis.EventTarget {
            constructor() {
              super();
              globalThis.pdfRecoveryCalls.push('worker');
              if (failure === 'worker-blocked') throw new globalThis.DOMException('Worker unavailable', 'SecurityError');
              globalThis.setTimeout(() => this.dispatchEvent(new globalThis.Event('error')), 0);
            }
            postMessage() {}
            terminate() {}
          };
        } else {
          globalThis.webkit = { messageHandlers: { bridge: {} } };
          globalThis.Capacitor = {
            PluginHeaders: [
              { name: 'Filesystem', methods: [{ name: 'writeFile', rtype: 'promise' }] },
              { name: 'FileViewer', methods: [{ name: 'openDocumentFromLocalPath', rtype: 'promise' }] },
              { name: 'Share', methods: [{ name: 'share', rtype: 'promise' }] },
            ],
            nativePromise: async (plugin, method, options) => {
              globalThis.pdfRecoveryCalls.push({ plugin, method, options });
              if (plugin === 'Filesystem') return { uri: `file:///private/Caches/${encodeURI(options.path)}` };
              if (plugin === 'FileViewer') throw new Error('Native viewer unavailable');
              if (plugin === 'Share') return {};
              throw new Error('Unexpected native method');
            },
          };
        }
      }, { program, failure });
      await page.goto(`${base}?mode=student`);
      await page.getByRole('button', { name: 'ابدأ', exact: true }).click();
      await page.getByRole('button', { name: 'ابدأ', exact: true }).click();
      await page.getByRole('button', { name: attachment.fileName, exact: true }).click();
      const dialog = page.getByRole('dialog', { name: attachment.fileName, exact: true });
      if (process.env.PDF_RECOVERY_EXPECT_FAILURE) {
        await dialog.getByRole('alert').getByText('تعذر عرض PDF. يمكنك تحميل الملف.', { exact: true }).waitFor();
        assert.equal(await dialog.locator('canvas').count(), 0);
        console.log(`Baseline reproduces the failed PDF display: ${failure}`);
        await page.screenshot({ path: `outputs/news-pdf-followup/baseline-${failure}.png` });
        await context.close();
        continue;
      }
      try { await dialog.locator('canvas').waitFor(); }
      catch (error) {
        console.log(JSON.stringify({ failure, width, alerts: await page.getByRole('alert').allTextContents(), errors }));
        await page.screenshot({ path: `outputs/news-pdf-followup/${browserType.name()}-failure.png` });
        throw error;
      }
      await dialog.getByText('FIRST SECTION', { exact: false }).waitFor({ state: 'attached' });
      assert.equal(await dialog.getByRole('alert').count(), 0);
      const pixel = await dialog.locator('canvas').evaluate(canvas => [...canvas.getContext('2d').getImageData(canvas.width / 4, canvas.height / 5, 1, 1).data]);
      assert.ok(pixel[0] > pixel[1] && pixel[0] > pixel[2], 'The PDF is rendered, not just an empty canvas');
      await dialog.getByRole('button', { name: 'الصفحة التالية', exact: true }).click();
      await dialog.getByText('SECOND PAGE', { exact: true }).waitFor({ state: 'attached' });
      if (failure === 'native-viewer') {
        await dialog.getByRole('button', { name: 'تحميل الملف', exact: true }).click();
        await page.waitForFunction(() => globalThis.pdfRecoveryCalls.some(call => call.plugin === 'Share'));
        const calls = await page.evaluate(() => globalThis.pdfRecoveryCalls);
        const writes = calls.filter(call => call.plugin === 'Filesystem');
        assert.equal(calls.filter(call => call.plugin === 'FileViewer').length, 1, 'Native failure triggers one inline fallback');
        assert.equal(writes.length, 2);
        for (const write of writes) assert.deepEqual(Buffer.from(write.options.data, 'base64'), pdf);
        assert.match(calls.find(call => call.plugin === 'Share').options.files[0], /^file:\/\/\/private\/Caches\//);
      } else {
        assert.ok((await page.evaluate(() => globalThis.pdfRecoveryCalls)).includes('worker'));
        const downloaded = page.waitForEvent('download');
        await dialog.getByRole('button', { name: 'تحميل الملف', exact: true }).click();
        const file = await downloaded;
        assert.equal(file.suggestedFilename(), attachment.fileName);
        assert.equal(await file.failure(), null);
        assert.deepEqual(await readFile(await file.path()), pdf);
      }
      await dialog.evaluate(async element => { await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished)); });
      assert.ok(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth));
      const touchTarget = await dialog.getByRole('button', { name: 'تحميل الملف', exact: true }).evaluate(element => ({ height: element.getBoundingClientRect().height, minimum: globalThis.getComputedStyle(element).minHeight, transform: globalThis.getComputedStyle(element.closest('[role=dialog]')).transform }));
      assert.ok(touchTarget.height >= 44, JSON.stringify(touchTarget));
      await page.screenshot({ path: `outputs/news-pdf-followup/${browserType.name()}-${failure}-${width}.png` });
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      assert.deepEqual(errors, []);
      await context.close();
    }
    if (process.env.PDF_RECOVERY_EXPECT_FAILURE) break;
  }
  console.log(process.env.PDF_RECOVERY_EXPECT_FAILURE
    ? `${browserType.name()}: original display failures reproduced for blocked workers and a rejected native viewer.`
    : `${browserType.name()}: PDF worker rejection, asynchronous worker failure and native viewer failure recover to real page rendering; original-byte downloads passed at 360/768/1440px.`);
} finally { await browser.close(); }
