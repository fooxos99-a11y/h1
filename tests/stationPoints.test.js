import test from 'node:test';
import assert from 'node:assert/strict';
import { requireActivePointsStation, saveStationPointsBatch } from '../server/services/stationPoints.js';
import express from 'express';
import { createStationPointsRouter } from '../server/routes/stationPointsRoutes.js';

const settings = { pointsSystemEnabled: true, summitEnabled: true, summitMapConfig: { activeStationId: 'station-a', stations: [{ id: 'station-a', name: 'محطة التجمع', kilometer: 0, rewardPoints: 80 }] } };

test('station grades endpoints reject student accounts before reading or awarding points', async () => {
  const app = express();
  app.use((req, _res, next) => { req.auth = { role: 'student', id: 1 }; next(); });
  app.use(createStationPointsRouter({ loadSettings: async () => assert.fail('Unauthorized settings read') }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    for (const method of ['GET', 'PUT']) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/station-a/grades`, { method });
      assert.equal(response.status, 403);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});
function fixture({ allowed = true, exists = true } = {}) {
  const awarded = [], ledger = [], saved = new Map();
  const connection = { query: async (sql, args) => {
    if (sql.startsWith('SELECT id, committee')) return [exists ? [{ id: args[0], committeeId: 3 }] : []];
    if (sql.includes('supervisor_committees')) return [allowed ? [{ allowed: 1 }] : []];
    if (sql.startsWith('SELECT id, earned_points')) return [saved.has(args[0]) ? [{ id: args[0] + 100, earnedPoints: saved.get(args[0]) }] : []];
    if (sql.startsWith('INSERT INTO student_station_points')) { saved.set(args[0], args[2]); return [{ insertId: args[0] + 100 }]; }
    throw new Error(sql);
  } };
  const save = (grades, options = {}) => saveStationPointsBatch(connection, { grades, stationId: 'station-a', settings,
    actor: { role: 'supervisor', id: 7, name: 'معلم' }, date: '2026-09-28', ...options }, {
    applyStudentPointDelta: async (_c, studentId, delta) => awarded.push({ studentId, delta }),
    logStudentPointTransaction: async (_c, entry) => ledger.push(entry),
  });
  return { save, awarded, ledger, saved };
}

test('station attendance awards once and corrections apply only the difference', async () => {
  const f = fixture();
  for (const points of [80, 80, 30, 0]) await f.save([{ studentId: 2, points }]);
  assert.deepEqual(f.awarded, [{ studentId: 2, delta: 80 }, { studentId: 2, delta: -50 }, { studentId: 2, delta: -30 }]);
  assert.ok(f.ledger.every(row => row.sourceType === 'summit_station' && row.sourceId === 102 && row.reason === 'محطة: محطة التجمع'));
  assert.deepEqual(f.ledger.map(row => row.type), ['increase', 'deduction', 'deduction']);
});

test('station grades reject invalid batches and amounts before writing', async () => {
  for (const grades of [[], null, [{ studentId: 2, points: 81 }], [{ studentId: 2, points: -1 }], [{ studentId: 2, points: 1.5 }], [{ studentId: 2, points: '5' }], [{ studentId: 2, points: 10 }, { studentId: 2, points: 20 }]]) {
    const f = fixture();
    await assert.rejects(f.save(grades), { statusCode: 422 });
    assert.equal(f.saved.size, 0);
  }
});

test('station must exist, be active and have both map and points enabled', () => {
  assert.throws(() => requireActivePointsStation(settings, 'missing'), { statusCode: 404 });
  for (const overrides of [{ summitEnabled: false }, { pointsSystemEnabled: false }, { summitMapConfig: { ...settings.summitMapConfig, activeStationId: null } }]) {
    assert.throws(() => requireActivePointsStation({ ...settings, ...overrides }, 'station-a'), { statusCode: 422 });
  }
});

test('station respects staff circle scope and ignores payload actor or station overrides', async () => {
  for (const role of ['supervisor', 'reciter']) {
    const f = fixture({ allowed: false });
    await assert.rejects(f.save([{ studentId: 2, points: 50 }], { actor: { role, id: 7 } }), { statusCode: 403 });
    assert.equal(f.saved.size, 0);
  }
  const f = fixture();
  await f.save([{ studentId: 2, points: 30, stationId: 'other', actor: { role: 'manager' } }]);
  assert.equal(f.ledger[0].actorRole, 'supervisor');
  assert.equal(f.ledger[0].sourceId, 102);
  await assert.rejects(fixture({ exists: false }).save([{ studentId: 2, points: 5 }]), { statusCode: 404 });
});
