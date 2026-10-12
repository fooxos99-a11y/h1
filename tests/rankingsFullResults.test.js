import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { rankFamilies } from '../shared/family-rankings.js';

const source = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

for (const kind of ['students', 'families']) {
  test(`${kind} ranking returns all 45 ordered results and preserves visibility and failure handling`, async () => {
    const start = source.indexOf(`app.get('/api/rankings/${kind}'`);
    const route = source.slice(start, source.indexOf('\napp.get(', start + 1));
    const body = route.slice(route.indexOf('=> {') + 4, route.lastIndexOf('\n});'));
    const handle = new AsyncFunction('req', 'res', 'next', 'loadSettings', 'db', 'rankFamilies', body);
    const database = new DatabaseSync(':memory:');
    database.function('GREATEST', { varargs: true }, (...values) => Math.max(...values));
    database.exec('CREATE TABLE committees (id INTEGER, name TEXT, points INTEGER); CREATE TABLE students (id INTEGER, name TEXT, points INTEGER, committee_id INTEGER);');
    for (let i = 1; i <= 45; i++) {
      database.prepare('INSERT INTO committees VALUES (?, ?, ?)').run(i, `Circle ${i}`, 0);
      database.prepare('INSERT INTO students VALUES (?, ?, ?, ?)').run(i, `Student ${i}`, i, i);
    }
    let result;
    let status;
    let failure;
    let queries = 0;
    const res = { json(value) { result = value; }, status(value) { status = value; return this; } };
    const next = error => { failure = error; };
    const db = () => ({ query: async (query, params = []) => { queries++; return [database.prepare(query).all(...params)]; } });
    const settings = { studentRankingsVisible: true, familyRankingsVisible: true };
    const call = (query = {}, config = settings, connection = db) => handle({ query }, res, next, async () => config, connection, rankFamilies);
    try {
      await call();
      assert.equal(failure, undefined);
      assert.equal(result.length, 45);
      assert.deepEqual(result.map(row => row.id), Array.from({ length: 45 }, (_, i) => 45 - i));
      assert.deepEqual(result.map(row => row.rank), Array.from({ length: 45 }, (_, i) => i + 1));
      if (kind === 'students') {
        await call({ committeeId: '25' });
        assert.deepEqual(result.map(row => row.id), [25]);
        await call({ committeeId: '25 OR 1=1' });
        assert.deepEqual(result, []);
      }
      const before = queries;
      await call({}, { studentRankingsVisible: false, familyRankingsVisible: false });
      assert.equal(status, 404);
      assert.equal(queries, before);
      const error = new Error('Database unavailable');
      await call({}, settings, () => ({ query: async () => { throw error; } }));
      assert.equal(failure, error);
    } finally { database.close(); }
  });
}
