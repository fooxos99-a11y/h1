import test from 'node:test';
import assert from 'node:assert/strict';
import { manualNarrationRange, selectNarrationStudents } from '../server/services/narrationSelection.js';
import { readFile } from 'node:fs/promises';

const students = [{ id: 1, name: 'طالب مرتبط', committeeId: 3 }, { id: 2, name: 'طالب مستقل', committeeId: 3 }];
test('full narration selects only requested authorized students and ignores client ranges', () => {
  const result = selectNarrationStudents(students, { selectionMode: 'full', studentSelections: [{ studentId: 2, fromPage: 99, faces: 99 }] });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 2);
  assert.equal(result[0].narrationSelection, null);
  assert.deepEqual(students, [{ id: 1, name: 'طالب مرتبط', committeeId: 3 }, { id: 2, name: 'طالب مستقل', committeeId: 3 }]);
});
test('manual narration freezes independent 13 and 10 face targets irrespective of Nazem linkage', () => {
  const result = selectNarrationStudents(students, { selectionMode: 'manual', studentSelections: [
    { studentId: 1, fromPage: 582, faces: 13 }, { studentId: 2, fromPage: 1, faces: 10 },
  ] });
  assert.deepEqual(result.map((student) => student.narrationSelection), [
    { fromPage: 582, toPage: 594, faces: 13 }, { fromPage: 1, toPage: 10, faces: 10 },
  ]);
});
test('unauthorized or duplicate students, empty choices and invalid amounts are rejected', () => {
  assert.throws(() => selectNarrationStudents(students, { selectionMode: 'full', studentSelections: [{ studentId: 777 }] }), { statusCode: 403 });
  for (const studentSelections of [[], [null], ['1'], [[1]], [{ studentId: 1 }, { studentId: 1 }]]) {
    assert.throws(() => selectNarrationStudents(students, { selectionMode: 'full', studentSelections }), { statusCode: 422 });
  }
  for (const [fromPage, faces] of [[0, 10], [604, 2], [1, 0], [1, 1.5], [1.5, 3], ['', 13], [1, ''], [NaN, 2]]) {
    assert.throws(() => selectNarrationStudents(students, { selectionMode: 'manual', studentSelections: [{ studentId: 1, fromPage, faces }] }), { statusCode: 422 });
  }
});
test('manual targets use server Quran boundaries, including one face and last page', async () => {
  const reads = [];
  const readPage = async (page) => {
    reads.push(page);
    return { start: { page, surah: 2, ayah: page }, end: { page, surah: 2, ayah: page + 1 } };
  };
  assert.deepEqual(await manualNarrationRange({ fromPage: 20, toPage: 32 }, readPage), {
    startPage: 20, startSurah: 2, startAyah: 20, endPage: 32, endSurah: 2, endAyah: 33,
  });
  assert.deepEqual(reads, [20, 32]);
  reads.length = 0;
  assert.equal((await manualNarrationRange({ fromPage: 604, toPage: 604 }, readPage)).endPage, 604);
  assert.deepEqual(reads, [604]);
  await assert.rejects(manualNarrationRange({ fromPage: 2, toPage: 2 }, async () => null), { statusCode: 422 });
});
test('legacy clients retain all authorized students in full mode', () => {
  assert.equal(selectNarrationStudents(students, {}).length, 2);
});

test('actual create handler snapshots selected targets across juz boundaries and rolls back unauthorized or incomplete requests', async () => {
  const source = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
  const compile = (code, dependencies) => new Function(...Object.keys(dependencies), `return ${code}`)(...Object.values(dependencies));
  const startPosition = (range) => ({ page: range.startPage, surah: range.startSurah, ayah: range.startAyah });
  const endPosition = (range) => ({ page: range.endPage, surah: range.endSurah, ayah: range.endAyah });
  const range = (from, to) => ({ startPage: from, startSurah: 1, startAyah: from * 10, endPage: to, endSurah: 1, endAyah: to * 10 + 9 });
  const juzRanges = [{ ...range(1, 25), juz: 1 }, { ...range(26, 604), juz: 2 }];
  const collect = compile(source.slice(source.indexOf('async function collectNarrationJuzParts'), source.indexOf('async function getStudentQuranReviewHistory')), {
    getQuranRangeStart: startPosition, getQuranRangeEnd: endPosition,
    compareQuranPosition: (first, second) => first.surah - second.surah || first.ayah - second.ayah,
    calculateQuranRangeFaces: async (_connection, bounds) => bounds.endPage - bounds.startPage + 1,
  });
  const writes = [];
  let commits = 0;
  let rollbacks = 0;
  let emptyMemorization = false;
  const connection = { beginTransaction: async () => {}, commit: async () => { commits++; }, rollback: async () => { rollbacks++; }, release() {},
    query: async (sql, params) => {
      if (sql.includes('INSERT INTO')) { writes.push({ sql, params: structuredClone(params) }); return [{ insertId: writes.length }]; }
      if (sql.includes('FROM students s')) return [students];
      throw new Error(`Unexpected SQL: ${sql}`);
    } };
  const createEntries = compile(source.slice(source.indexOf('async function createNarrationStudentEntries'), source.indexOf('/** Intersect memorized ranges')), {
    mergeQuranRanges: async (_connection, ranges) => ranges,
    getStudentMemorizedRanges: async () => emptyMemorization ? [] : [range(1, 40)],
    addUtcDays: () => '2026-10-02', collectNarrationJuzParts: collect, manualNarrationRange,
    getQuranPageBoundary: async (_connection, page) => ({ start: startPosition(range(page, page)), end: endPosition(range(page, page)) }),
  });
  const routeStart = source.indexOf("app.post('/api/narration-events',");
  const handler = compile(source.slice(source.indexOf('async (req, res, next)', routeStart), source.indexOf('\n});', routeStart) + 2), {
    db: () => ({ getConnection: async () => connection }), isValidDateOnly: (value) => /^\d{4}-\d{2}-\d{2}$/.test(value),
    ensureCommitteeIdsExist: async (_connection, ids) => ids, canAccessNarrationCommittee: async () => false,
    getQuranJuzRanges: async () => juzRanges, selectNarrationStudents, createNarrationStudentEntries: createEntries,
    getNarrationEvent: async () => null, sendNarrationMessages: async () => { throw new Error('No external messages in test'); },
  });
  const body = { name: 'سرد تجريبي', startDate: '2026-10-01', endDate: '2026-10-01', scope: 'committee', committeeIds: [3], selectionMode: 'manual',
    studentSelections: [{ studentId: 1, fromPage: 20, faces: 13 }, { studentId: 2, fromPage: 1, faces: 10 }] };
  const run = async (payload) => {
    let response;
    const res = { status(code) { response = { status: code }; return this; }, json(value) { response = { status: response?.status || 200, body: value }; } };
    await handler({ body: payload, auth: { role: 'manager', id: 1 } }, res, (error) => { response = { status: error.statusCode || 500 }; });
    return response;
  };
  assert.equal((await run(body)).status, 201);
  assert.equal(commits, 1);
  const targets = writes.filter((write) => write.sql.includes('INSERT INTO narration_event_students'));
  assert.deepEqual(targets.map((write) => [write.params[1], write.params[5]]), [[1, 13], [2, 10]]);
  const segments = writes.filter((write) => write.sql.includes('INSERT INTO narration_event_parts'));
  assert.deepEqual(segments[0].params[0].map((part) => [part[1], part[4], part[7], part[8]]), [[1, 20, 25, 6], [2, 26, 32, 7]]);
  assert.equal((await run({ ...body, studentSelections: [{ studentId: 777, fromPage: 1, faces: 13 }] })).status, 403);
  assert.equal((await run({ ...body, studentSelections: [{ studentId: 1, fromPage: 604, faces: 13 }] })).status, 422);
  emptyMemorization = true;
  assert.equal((await run({ ...body, selectionMode: 'full' })).status, 422);
  assert.equal(commits, 1);
  assert.equal(rollbacks, 3);
});
