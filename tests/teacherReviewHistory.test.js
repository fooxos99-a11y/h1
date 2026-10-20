import test from 'node:test';
import assert from 'node:assert/strict';
import { compileQuranRanges, loadTeacherReviewHistory } from '../server/services/teacherReviewHistory.js';
import { loadReviewCycle } from '../server/services/quranReviewCycle.js';

const range = (start, end) => ({ startPage: start, startSurah: start, startAyah: 1, endPage: end, endSurah: end, endAyah: 2 });
const ayahs = [1, 2, 3, 4].flatMap(page => [1, 2].map(ayah => ({ page, surah: page, ayah })));

test('compiled range membership matches page, surah and verse ordering with overlaps, gaps and descending ranges', () => {
  const ranges = [range(1, 2), range(2, 2), range(4, 3)];
  const contains = compileQuranRanges(ranges);
  for (const page of [0, 1, 2, 3, 4, 5]) for (const surah of [1, 2, 3, 4]) for (const ayah of [0, 1, 2, 3]) {
    const key = p => Number(p.page) * 1_000_000 + Number(p.surah) * 1000 + Number(p.ayah);
    const current = { page, surah, ayah };
    const expected = ranges.some(r => {
      const a = key({ page: r.startPage, surah: r.startSurah, ayah: r.startAyah });
      const b = key({ page: r.endPage, surah: r.endSurah, ayah: r.endAyah });
      return key(current) >= Math.min(a, b) && key(current) <= Math.max(a, b);
    });
    assert.equal(contains(current), expected);
  }
  assert.equal(compileQuranRanges([])(ayahs[0]), false);
});

test('review history uses three scoped reads for hundreds of dates and preserves historical acceptance and links', async () => {
  const queries = [];
  const prior = [{ studentId: 1, ...range(1, 1) }];
  const completed = [{ id: 21, studentId: 1, taskDate: '2026-10-18', ...range(2, 2) }];
  const reviews = [
    { id: 31, studentId: 1, planId: 7, taskType: 'review', taskDate: '2026-10-17', fromPage: 1, toPage: 1, studentStatus: 'pending', teacherCompleted: null },
    { id: 32, studentId: 1, planId: 7, taskType: 'review', taskDate: '2026-10-18', fromPage: 2, toPage: 2, studentStatus: 'done', teacherCompleted: 0 },
    { id: 33, studentId: 1, planId: 7, taskType: 'review', taskDate: '2026-10-19', fromPage: 3, toPage: 3, studentStatus: 'pending', teacherCompleted: null },
    { id: 34, studentId: 1, planId: 7, taskType: 'link', taskDate: '2026-10-19', ...range(2, 2) },
  ];
  const connection = { query: async (sql, params) => { queries.push({ sql, params }); return [[prior, completed, reviews][queries.length - 1]]; } };
  const history = await loadTeacherReviewHistory(connection, [
    { studentId: 1, taskType: 'review', nazemManaged: 0 }, { studentId: 1, taskType: 'review', nazemManaged: 0 },
    { studentId: 99, taskType: 'review', nazemManaged: 1 }, { studentId: 98, taskType: 'memorization' },
  ], { acceptedSql: '(teacher_completed=1)', expandRange: async value => [value], ayahs });
  assert.deepEqual(queries.map(q => q.params), [[1, 1], [1], [1]]);
  const plan = { id: 7, studentId: 1, startPage: 1 };
  assert.equal(history.forDate(plan, '2026-10-18').saved.length, 1);
  const current = history.forDate(plan, '2026-10-19');
  assert.equal(current.saved.length, 2);
  assert.equal(current.links.length, 1);
  assert.equal(current.latestReview.id, 32);
  assert.equal(current.fallbackPage, 2);
  for (let i = 0; i < 500; i += 1) history.forDate(plan, '2026-10-20');
  assert.equal(queries.length, 3);
});

test('preloaded review history preserves the exact cycle, rejection and wrap without rereading the database', async () => {
  const plan = { id: 7, startSurah: 4, endSurah: 1 };
  const rows = [{ targetPages: 3 }];
  for (const history of [null, { reviewExecution: null, teacherCompleted: 0 }]) {
    let queries = 0;
    const connection = { query: async () => { queries += 1; return [[history]]; } };
    const args = { connection, plan, date: '2026-10-20', rows, ayahs, isAvailable: a => a.page !== 2, fallbackPage: 3 };
    const legacy = await loadReviewCycle(args);
    const preloaded = await loadReviewCycle({ ...args, historyOverride: history });
    assert.deepEqual(preloaded, legacy);
    assert.equal(queries, 1);
  }
});

test('no local review means no history queries or data from another account', async () => {
  const connection = { query() { throw new Error('Unexpected query'); } };
  assert.equal(await loadTeacherReviewHistory(connection, [{ studentId: 1, taskType: 'review', nazemManaged: 1 }], { ayahs }), null);
});
