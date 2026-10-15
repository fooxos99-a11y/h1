import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
const routeHandler = (marker) => {
  const start = source.indexOf(marker);
  assert.ok(start >= 0);
  return source.slice(source.indexOf('async (req, res, next)', start), source.indexOf('\n});', start) + 2);
};
const rateStart = source.indexOf('const rateSupervisorQuranTaskHandler =');
const bootstrapStart = source.indexOf('prepareOfflineWindow: async');
const handlers = [
  ['evaluation', routeHandler("app.get('/api/supervisors/:id/quran-evaluation'")],
  ['range', routeHandler("app.post('/api/supervisors/:id/quran-evaluation/:taskId/range'")],
  ['ayahs', routeHandler("app.get('/api/supervisors/:id/quran-evaluation/:taskId/ayahs'")],
  ['save', source.slice(source.indexOf('async (req, res, next)', rateStart), source.indexOf('\n};', rateStart) + 2)],
  ['bootstrap', source.slice(source.indexOf('async (', bootstrapStart), source.indexOf('\n  },', bootstrapStart) + 4)],
];

function boundedPool(capacity) {
  const waiting = [];
  let active = 0;
  let acquisitions = 0;
  let queries = 0;
  const acquire = () => {
    active += 1;
    let released = false;
    return {
      query: async () => { queries += 1; return [[]]; },
      rollback: async () => {},
      release: () => {
        if (released) return;
        released = true;
        active -= 1;
        const next = waiting.shift();
        if (next) next.resolve(acquire());
      },
    };
  };
  const pool = {
    getConnection: async () => {
      acquisitions += 1;
      return active < capacity ? acquire() : new Promise((resolve, reject) => waiting.push({ resolve, reject }));
    },
    query: async (...args) => {
      const connection = await pool.getConnection();
      try { return await connection.query(...args); }
      finally { connection.release(); }
    },
    close: () => { waiting.splice(0).forEach(item => item.reject(new Error('test pool closed'))); },
    counts: () => ({ active, acquisitions, queries }),
  };
  return pool;
}

for (const [name, definition] of handlers) {
  test(`${name} reads recitation settings without acquiring a second connection from a full pool`, async () => {
    const capacity = 2;
    const pool = boundedPool(capacity);
    const settingsRead = new Error('settings read; stop before any task mutation');
    const handler = vm.runInNewContext(`(${definition})`, {
      db: () => pool,
      isOwnRecitationAccount: (req, id) => Number(req.auth.id) === id,
      getSaudiDateTimeParts: () => ({ date: '2026-10-15' }),
      loadSettings: async (executor = pool) => {
        await executor.query('SELECT setting_key, setting_value FROM app_settings');
        throw settingsRead;
      },
    });
    let timer;
    try {
      const invoke = name === 'bootstrap'
        ? await Promise.all(Array.from({ length: capacity }, async () => {
          // The router owns a connection before invoking its preparation callback.
          const connection = await pool.getConnection();
          return () => handler({ connection }).catch(error => assert.equal(error, settingsRead))
            .finally(() => connection.release());
        }))
        : Array.from({ length: capacity }, () => () => handler(
          { params: { id: '11', taskId: '42' }, auth: { id: 11 } }, {}, error => assert.equal(error, settingsRead),
        ));
      const calls = invoke.map(callback => callback());
      await Promise.race([
        Promise.all(calls),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('recitation deadlocked on the full connection pool')), 150); }),
      ]);
      assert.deepEqual(pool.counts(), { active: 0, acquisitions: capacity, queries: capacity });
    } finally {
      clearTimeout(timer);
      pool.close();
    }
  });
}
