import assert from 'node:assert/strict';
import test from 'node:test';
import { attachmentRequestOptions, attachmentFileName, readAttachmentBlob, assertPdfAttachment, MAX_ATTACHMENT_BYTES } from '../src/lib/programAttachment.js';
import { saveNativeAttachment, viewNativeAttachment } from '../src/services/nativeAttachments.js';

const bytes = Buffer.from('%PDF-1.7\n\x00\xff\x80\n%%EOF', 'binary');
const blob = new Blob([bytes], { type: 'application/pdf' });
const nativeFiles = () => {
  const writes = [];
  return { writes, filesystem: { writeFile: async options => { writes.push(options); return { uri: `file:///private/Library/Caches/${encodeURI(options.path)}` }; } } };
};

test('iPhone viewing and saving use the original file bytes, a PDF extension and native file URIs', async () => {
  const { filesystem, writes } = nativeFiles();
  let opened, shared;
  await viewNativeAttachment(blob, 'الدرس الأول', { filesystem, viewer: { openDocumentFromLocalPath: async options => { opened = options; } } });
  await saveNativeAttachment(blob, 'الدرس الأول', { filesystem, share: { share: async options => { shared = options; } } });
  assert.equal(writes.length, 2);
  for (const write of writes) {
    assert.deepEqual(Buffer.from(write.data, 'base64'), bytes);
    assert.equal(write.directory, 'CACHE');
    assert.equal(write.encoding, undefined, 'Native binary files must not be written as UTF-8');
    assert.match(write.path, /\/الدرس الأول\.pdf$/);
  }
  assert.equal(opened.path, shared.files[0]);
  assert.match(opened.path, /^file:\/\/\/private\/Library\/Caches\/program-attachments\//);
});

test('native cache and sheet failures are actionable, while cancellation is normal', async () => {
  const { filesystem } = nativeFiles();
  await assert.rejects(saveNativeAttachment(blob, 'درس.pdf', { filesystem: { writeFile: async () => { throw new Error('disk full'); } } }), /disk full/);
  await assert.rejects(saveNativeAttachment(blob, 'درس.pdf', { filesystem, share: { share: async () => { throw new Error('sharing failed'); } } }), /sharing failed/);
  await saveNativeAttachment(blob, 'درس.pdf', { filesystem, share: { share: async () => { throw new Error('Share canceled'); } } });
  let opened = false;
  const controller = new AbortController();
  await viewNativeAttachment(blob, 'درس.pdf', { signal: controller.signal, filesystem: { writeFile: async () => { controller.abort(); return { uri: 'file:///cancelled.pdf' }; } }, viewer: { openDocumentFromLocalPath: async () => { opened = true; } } });
  assert.equal(opened, false, 'A closed attachment must not present a late native viewer');
});

test('native view and save work when the WebView does not expose WebCrypto', async () => {
  const cryptoProperty = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const { filesystem, writes } = nativeFiles();
  try {
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    await viewNativeAttachment(blob, 'درس.pdf', { filesystem, viewer: { openDocumentFromLocalPath: async () => {} } });
    await saveNativeAttachment(blob, 'درس.pdf', { filesystem, share: { share: async () => {} } });
    assert.equal(writes.length, 2);
    assert.deepEqual(Buffer.from(writes[1].data, 'base64'), bytes);
  } finally { Object.defineProperty(globalThis, 'crypto', cryptoProperty); }
});

test('PDF errors do not turn HTML/login responses into previews and downloads can be retried', async () => {
  await assert.rejects(assertPdfAttachment(new Blob(['<html>login</html>'])), /تعذر فتح/);
  await assert.rejects(readAttachmentBlob({ kind: 'pdf', url: 'https://example.test/file.pdf' }, {}, async () => new Response('<html>login</html>')), /تعذر فتح/);
  let attempts = 0;
  const fetchFile = async () => { attempts++; return attempts === 1 ? new Response('unauthorized', { status: 401 }) : new Response(bytes, { headers: { 'Content-Type': 'application/pdf' } }); };
  await assert.rejects(readAttachmentBlob({ url: 'https://example.test/api/file' }, {}, fetchFile), /تعذر تحميل/);
  assert.deepEqual(Buffer.from(await (await readAttachmentBlob({ url: 'https://example.test/api/file' }, {}, fetchFile)).arrayBuffer()), bytes);
  await assert.rejects(readAttachmentBlob({ url: 'https://example.test/file' }, {}, async () => new Response('large', { headers: { 'content-length': String(MAX_ATTACHMENT_BYTES + 1) } })), /تعذر فتح/);
  await assert.rejects(readAttachmentBlob({ url: 'https://example.test/file' }, {}, async () => new Response(new Uint8Array(MAX_ATTACHMENT_BYTES + 1))), /تعذر فتح/);
});

test('attachment requests send authentication only within the configured API and block authenticated redirects', () => {
  const api = 'https://mdarj.net/mdarj/api';
  const auth = { token: 'test-token', registrationNumber: 'test-tenant', native: true };
  const trusted = attachmentRequestOptions(`${api}/file`, api, auth);
  assert.equal(trusted.headers.Authorization, 'Bearer test-token');
  assert.equal(trusted.headers['X-Registration-Number'], 'test-tenant');
  assert.equal(trusted.credentials, 'include');
  assert.equal(trusted.redirect, 'error');
  for (const url of ['https://external.test/file', 'https://mdarj.net/mdarj/api-other/file', 'https://mdarj.net/uploads/file']) {
    const options = attachmentRequestOptions(url, api, auth);
    assert.deepEqual(options.headers, {});
    assert.equal(options.credentials, 'omit');
  }
});

test('download filenames cannot escape their cache directory and preserve Arabic within native limits', () => {
  assert.equal(attachmentFileName('../../درس.pdf', 'application/pdf'), 'درس.pdf');
  assert.notEqual(attachmentFileName('..'), '..');
  const name = attachmentFileName('🌟'.repeat(200), 'application/pdf');
  assert.ok(new TextEncoder().encode(name).length <= 200);
  assert.match(name, /\.pdf$/);
  assert.match(attachmentFileName(`${'الدرس'.repeat(100)}.pdf`, 'application/pdf'), /\.pdf$/);
});
