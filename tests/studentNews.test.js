import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import sharp from 'sharp';
import { normalizeStudentNews } from '../server/services/studentNews.js';
import { emptyStudentNews, visibleStudentNews } from '../shared/student-news.js';
import { createStudentNewsRouter } from '../server/routes/studentNewsRoutes.js';

test('news visibility enforces expiry, audience and disabled/empty cards without exposing audience IDs', () => {
  const content = { ...emptyStudentNews(), images: ['image'], studentIds: [244], expiresOn: '2026-09-23' };
  assert.equal(visibleStudentNews(content, 245, '2026-09-23'), null);
  assert.equal(visibleStudentNews(content, 244, '2026-09-24'), null);
  assert.equal(visibleStudentNews({ ...content, enabled: false }, 244, '2026-09-23'), null);
  assert.equal(visibleStudentNews({ ...content, images: [] }, 244, '2026-09-23'), null);
  assert.equal(visibleStudentNews(content, 244, '2026-09-23').studentIds, undefined);
});
test('news validates images and inputs and produces a bounded WebP image', async () => {
  const png = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: 'red' } }).png().toBuffer();
  const content = await normalizeStudentNews({ ...emptyStudentNews(), images: [`data:image/png;base64,${png.toString('base64')}`] });
  const meta = await sharp(Buffer.from(content.images[0].split(',')[1], 'base64')).metadata();
  assert.equal(meta.format, 'webp'); assert.equal(meta.width, 1400); assert.equal(meta.height, 700);
  const saved = await normalizeStudentNews({ ...content, revision: 1, title: 'مسمى آخر' }, content.images);
  assert.deepEqual(saved.images, content.images, 'Metadata edits must not recompress saved images');
  for (const invalid of [{ title: '' }, { expiresOn: '2026-02-30' }, { studentIds: [-1] }, { revision: -1 }, { images: ['data:image/svg+xml;base64,AA=='] }, { images: ['data:image/png;base64,AAAA'] }, { images: Array(9).fill('') }]) {
    await assert.rejects(normalizeStudentNews({ ...emptyStudentNews(), ...invalid }), error => error.statusCode === 422);
  }
});
test('news routes authorize management, enforce student audience and reject stale saves', async () => {
  const content = { ...emptyStudentNews(), title: 'تكريم', studentIds: [244], images: ['image'] };
  let writes = 0;
  const database = { query: async (sql, values) => {
    if (sql.startsWith('SELECT content')) return [[{ content: JSON.stringify(content), revision: 2 }]];
    if (sql.startsWith('UPDATE')) { writes++; return [{ affectedRows: values[1] === 2 ? 1 : 0 }]; }
    throw new Error('Unexpected query');
  } };
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.auth = { role: req.headers['x-test-role'], id: Number(req.headers['x-test-id']) }; next(); });
  app.use(createStudentNewsRouter({ getToday: () => '2026-09-23', db: () => database }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${url}/manage`, { headers: { 'x-test-role': 'student' } })).status, 403);
    const outsider = await fetch(url, { headers: { 'x-test-role': 'student', 'x-test-id': '245' } });
    assert.equal(await outsider.json(), null);
    const student = await fetch(url, { headers: { 'x-test-role': 'student', 'x-test-id': '244' } });
    assert.equal((await student.json()).title, 'تكريم');
    const save = revision => fetch(`${url}/manage`, { method: 'PUT', headers: { 'x-test-role': 'manager', 'Content-Type': 'application/json' }, body: JSON.stringify({ ...emptyStudentNews(), revision }) });
    assert.equal((await save(0)).status, 409);
    assert.equal((await save(2)).status, 200);
    assert.equal(writes, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
