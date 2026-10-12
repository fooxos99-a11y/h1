import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareProgramAttachment } from '../src/lib/programAttachment.js';
import { normalizePayload } from '../server/routes/programRoutes.js';
import { pdfPreviewAssets, pdfPreviewAssetFileNames } from '../scripts/pdf-preview-assets.mjs';
import { securityHeaders } from '../server/middleware/security.js';

const data = (mime, text) => `data:${mime};base64,${Buffer.from(text, 'binary').toString('base64')}`;
test('attachment replacement retains the new bytes and file type in both directions', async () => {
  for (const [mime, bytes, kind] of [['application/pdf', '%PDF-1.7', 'pdf'], ['image/png', '\x89PNG\r\n\x1a\n', 'image']]) {
    const file = { type: 'file', value: data(mime, bytes), fileName: 'بديل', mimeType: mime };
    const payload = normalizePayload({ title: 'برنامج', contents: [file], questions: [] });
    assert.equal(payload.contents.length, 1);
    assert.equal(payload.contents[0].value, file.value);
    assert.equal(payload.contents[0].mimeType, mime);
    const preview = prepareProgramAttachment(payload.contents[0]);
    assert.equal(preview.kind, kind);
    assert.deepEqual(Buffer.from(await preview.blob.arrayBuffer()), Buffer.from(bytes, 'binary'));
  }
});
test('empty MIME metadata cannot hide a valid PDF or image', () => {
  assert.equal(prepareProgramAttachment({ value: data('application/octet-stream', '%PDF-1.7') }).kind, 'pdf');
  assert.equal(prepareProgramAttachment({ value: data('application/octet-stream', '\x89PNG\r\n\x1a\n') }).kind, 'image');
});
test('untrusted files never become executable previews and unsafe URLs are rejected', async () => {
  for (const mime of ['text/html', 'image/svg+xml', 'application/javascript']) {
    const preview = prepareProgramAttachment({ value: data(mime, '<script>evil()</script>') });
    assert.equal(preview.kind, 'file');
    assert.equal(preview.blob.type, 'application/octet-stream');
  }
  for (const value of ['javascript:evil()', 'data:text/html,<script>evil()</script>', 'data:image/png;base64,@@', 'data:image/png;base64,', 'file:///private.pdf']) {
    assert.throws(() => prepareProgramAttachment({ value }), /تعذر فتح/);
  }
  assert.equal(prepareProgramAttachment({ type: 'pdf', value: '/uploads/old.pdf' }).kind, 'pdf');
  assert.throws(() => normalizePayload({ title: 'برنامج', contents: [{ type: 'file', value: 'javascript:evil()' }] }), /الملف غير صالح/);
});

test('PDF codecs and fonts ship locally and their development route rejects traversal', () => {
  assert.equal(pdfPreviewAssetFileNames({ names: ['pdf.worker.min.mjs'] }), 'assets/[name]-[hash].js');
  assert.equal(pdfPreviewAssetFileNames({ names: ['logo.png'] }), 'assets/[name]-[hash][extname]');
  const plugin = pdfPreviewAssets();
  const emitted = [];
  plugin.generateBundle.call({ emitFile: item => emitted.push(item) });
  for (const suffix of ['/wasm/jbig2.wasm', '/wasm/openjpeg.wasm', '/wasm/openjpeg_nowasm_fallback.js', '/standard_fonts/LiberationSans-Regular.ttf', '/cmaps/Adobe-GB1-UCS2.bcmap']) {
    assert.ok(emitted.some(item => item.fileName.endsWith(suffix) && item.source.byteLength > 0));
  }
  let middleware;
  plugin.configureServer({ config: { base: '/mdarj/' }, middlewares: { use: handler => { middleware = handler; } } });
  const source = emitted.find(item => item.fileName.endsWith('/wasm/jbig2.wasm'));
  const response = { statusCode: 200, setHeader: () => {}, end: bytes => { response.bytes = bytes; } };
  middleware({ url: `/mdarj/${source.fileName}` }, response, () => assert.fail('Expected local asset'));
  assert.equal(response.bytes.byteLength, source.source.byteLength);
  middleware({ url: '/mdarj/pdfjs/5.5.207/../../package.json' }, response, () => assert.fail('Expected rejected path'));
  assert.equal(response.statusCode, 404);
  let headers;
  securityHeaders({}, { set: value => { headers = value; } }, () => {});
  assert.match(headers['Content-Security-Policy'], /script-src 'self' 'wasm-unsafe-eval'/);
  assert.doesNotMatch(headers['Content-Security-Policy'], /(?:^|\s)'unsafe-eval'/);
  assert.match(headers['Content-Security-Policy'], /object-src 'none'/);
});
