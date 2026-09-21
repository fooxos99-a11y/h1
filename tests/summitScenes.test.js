import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { normalizeSummitMapConfig } from '../shared/summit-map.js';
import { getSummitScene } from '../shared/summit-scenes.js';
import createSummitImageRouter, { validateSummitImage } from '../server/routes/summitImageRoutes.js';

const cityImage = 'a'.repeat(64);
const roadImage = 'b'.repeat(64);
test('city and multiple road photos cover inclusive ranges without overlap and survive saving', () => {
  const config = normalizeSummitMapConfig({ cities: [
    { id: 'start', name: 'الموطا', kilometer: 0, cityEndKilometer: 500, imageId: cityImage, roads: [{ toKilometer: 750, imageId: roadImage }, { imageId: cityImage }] },
    { id: 'next', kilometer: 1000, cityEndKilometer: 1500, imageId: roadImage },
  ] });
  assert.deepEqual(normalizeSummitMapConfig(JSON.parse(JSON.stringify(config))), config);
  for (const km of [0, 499, 500]) assert.equal(getSummitScene(config, km).imageId, cityImage);
  for (const km of [501, 700, 750]) assert.equal(getSummitScene(config, km).imageId, roadImage);
  for (const km of [751, 999]) assert.equal(getSummitScene(config, km).kind, 'road');
  assert.equal(getSummitScene(config, 1000).city.id, 'next');
  assert.equal(getSummitScene(config, 1500).kind, 'city');
  assert.equal(getSummitScene(config, 1501).kind, 'road');
  assert.equal(getSummitScene(config, 8000), null);
});

test('scene limits clamp invalid boundaries and reject unsafe image references', () => {
  const config = normalizeSummitMapConfig({ cities: [
    { kilometer: 0, cityEndKilometer: -1, imageId: 'javascript:alert(1)', roads: [{ toKilometer: -5 }, { toKilometer: 99999 }] },
    { kilometer: 100, cityEndKilometer: 99999 },
  ] });
  assert.equal(config.cities[0].imageId, '');
  assert.deepEqual(config.cities[0].roads.map((r) => [r.fromKilometer, r.toKilometer]), [[1, 1], [2, 99]]);
  assert.equal(config.cities[1].cityEndKilometer, 7999);
  assert.equal(config.cities[1].roads.length, 0);
});

test('map image upload validates content and permissions and stores assets separately', async () => {
  assert.equal(validateSummitImage('data:image/svg+xml;base64,PHN2Zz4='), null);
  assert.equal(validateSummitImage('data:image/jpeg;base64,aGVsbG8='), null);
  assert.equal(validateSummitImage(`data:image/jpeg;base64,${'a'.repeat(700000)}`), null);
  const data = `data:image/jpeg;base64,${Buffer.from([255, 216, 255, 217]).toString('base64')}`;
  const id = validateSummitImage(data).id;
  const rows = new Map();
  const app = express();
  app.use(express.json());
  app.use(createSummitImageRouter({ db: () => ({ query: async (sql, args) => {
    if (sql.startsWith('INSERT')) { rows.set(args[0], args[1]); return [{}]; }
    return [[rows.has(args[0]) ? { imageData: rows.get(args[0]) } : undefined].filter(Boolean)];
  } }), requirePermission: (permission) => (req, res, next) => {
    assert.equal(permission, 'settings');
    if (req.headers['x-test-role'] !== 'manager') return res.sendStatus(403);
    next();
  } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const post = (role, imageData) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-test-role': role }, body: JSON.stringify({ imageData }) });
    assert.equal((await post('student', data)).status, 403);
    assert.equal((await post('manager', 'invalid')).status, 422);
    assert.deepEqual(await (await post('manager', data)).json(), { id });
    await post('manager', data);
    assert.equal(rows.size, 1);
    assert.deepEqual(await (await fetch(`${url}/${id}`)).json(), { imageData: data });
    assert.equal((await fetch(`${url}/${'c'.repeat(64)}`)).status, 404);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
