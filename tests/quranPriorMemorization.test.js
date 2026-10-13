import assert from 'node:assert/strict';
import test from 'node:test';
import { compareQuranPositionInDirection as compare } from '../shared/quran-execution-policy.js';
import { removePriorMemorizationRange } from '../server/services/quranPriorMemorization.js';

const planTable = 'student_quran_plan_prior_memorization';
const standaloneTable = 'student_quran_prior_memorization';
const ayahs = Array.from({ length: 13 }, (_, index) => ({ surah: 60, ayah: index + 1, page: 549 + Math.floor(index / 5) }));
const range = (start = ayahs[0], end = ayahs.at(-1), extra = {}) => ({
  id: 1, studentId: 7, startPage: start.page, startSurah: start.surah, startAyah: start.ayah,
  endPage: end.page, endSurah: end.surah, endAyah: end.ayah, ...extra,
});
const getAdjacent = async (_connection, current, direction) => ayahs[ayahs.findIndex(ayah => compare(ayah, current) === 0) + (direction === 'next' ? 1 : -1)] || null;
const bounds = rows => rows.map(row => [row.startAyah, row.endAyah]);

// Storage double tests range subtraction; the opt-in MySQL/API test verifies the SQL and authorization.
function storage(planRows = [], standaloneRows = []) {
  const tables = { [planTable]: structuredClone(planRows), [standaloneTable]: structuredClone(standaloneRows) };
  return {
    tables,
    async query(sql, values) {
      const table = sql.match(/(?:FROM|INTO) (student_quran_(?:plan_)?prior_memorization)\b/)?.[1];
      assert.ok(table, `Unexpected storage query: ${sql}`);
      if (sql.startsWith('SELECT')) {
        const [studentId, endPage, , endSurah, , , endAyah, startPage, , startSurah, , , startAyah] = values;
        return [tables[table].filter(row => row.studentId === studentId
          && compare({ page: row.startPage, surah: row.startSurah, ayah: row.startAyah }, { page: endPage, surah: endSurah, ayah: endAyah }) <= 0
          && compare({ page: row.endPage, surah: row.endSurah, ayah: row.endAyah }, { page: startPage, surah: startSurah, ayah: startAyah }) >= 0)];
      }
      if (sql.startsWith('DELETE')) {
        const [studentId, ...ids] = values;
        tables[table] = tables[table].filter(row => row.studentId !== studentId || !ids.includes(row.id));
        return [{ affectedRows: ids.length }];
      }
      const [owner, studentId, startSurah, startAyah, startPage, endSurah, endAyah, endPage] = values;
      tables[table].push({ id: 100 + tables[table].length, studentId,
        startSurah, startAyah, startPage, endSurah, endAyah, endPage,
        ...(table === planTable ? { planId: owner } : { source: owner }) });
      return [{ affectedRows: 1 }];
    },
  };
}

test('deleting memorization removes registration and all plan copies for only the selected student', async () => {
  const other = range(undefined, undefined, { id: 2, studentId: 8, source: 'registration' });
  const db = storage([range(undefined, undefined, { planId: 11 }), range(undefined, undefined, { id: 3, planId: 12 })],
    [range(undefined, undefined, { source: 'registration' }), other]);
  assert.equal(await removePriorMemorizationRange(db, 7, ayahs[0], ayahs.at(-1), getAdjacent), 3);
  assert.deepEqual(db.tables[planTable], []);
  assert.deepEqual(db.tables[standaloneTable], [other]);
});

test('deleting middle ayahs preserves both remainders, original plan and registration source', async () => {
  const db = storage([range(undefined, undefined, { planId: 11 })], [range(undefined, undefined, { source: 'registration' })]);
  await removePriorMemorizationRange(db, 7, ayahs[4], ayahs[7], getAdjacent);
  assert.deepEqual(bounds(db.tables[planTable]), [[1, 4], [9, 13]]);
  assert.deepEqual(bounds(db.tables[standaloneTable]), [[1, 4], [9, 13]]);
  assert.ok(db.tables[planTable].every(row => row.planId === 11));
  assert.ok(db.tables[standaloneTable].every(row => row.source === 'registration'));
});

test('deleting one end preserves only the opposite part without reintroducing removed ayahs', async () => {
  for (const [start, end, expected] of [[ayahs[0], ayahs[4], [[6, 13]]], [ayahs[7], ayahs.at(-1), [[1, 7]]]]) {
    const db = storage([], [range(undefined, undefined, { source: 'registration' })]);
    await removePriorMemorizationRange(db, 7, start, end, getAdjacent);
    assert.deepEqual(bounds(db.tables[standaloneTable]), expected);
  }
});

test('nonoverlapping prior memorization is preserved and repeat deletion changes nothing', async () => {
  const original = range(ayahs[0], ayahs[3], { planId: 11 });
  const db = storage([original]);
  assert.equal(await removePriorMemorizationRange(db, 7, ayahs[4], ayahs.at(-1), getAdjacent), 0);
  assert.deepEqual(db.tables[planTable], [original]);
  assert.equal(await removePriorMemorizationRange(db, 7, ayahs[0], ayahs[3], getAdjacent), 1);
  assert.equal(await removePriorMemorizationRange(db, 7, ayahs[0], ayahs[3], getAdjacent), 0);
});

test('storage failures propagate to the transaction owner instead of reporting successful deletion', async () => {
  const db = storage([], [range(undefined, undefined, { source: 'registration' })]);
  const query = db.query.bind(db);
  db.query = (sql, values) => {
    if (sql.startsWith('INSERT')) throw new Error('injected insert failure');
    return query(sql, values);
  };
  await assert.rejects(removePriorMemorizationRange(db, 7, ayahs[4], ayahs[7], getAdjacent), /injected insert failure/);
});
