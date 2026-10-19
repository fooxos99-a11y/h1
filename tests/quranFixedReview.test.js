import assert from 'node:assert/strict';
import test from 'node:test';
import { pickReviewPages, reviewPageRanges } from '../shared/quran-review-pages.js';
import { buildReviewCycle, selectReviewEnd } from '../shared/quran-review-cycle.js';
import { latestApprovedLinkAnchor } from '../server/services/quranLinkAnchor.js';

test('20 review faces remain 20 when only three pages are available', () => {
  const selected = pickReviewPages(new Set([1, 2, 3]), 1, 20);
  assert.equal(selected.pages.length, 20);
  assert.deepEqual(selected.pages.slice(0, 7), [1, 2, 3, 1, 2, 3, 1]);
  assert.equal(selected.nextReviewPage, 3);
  assert.deepEqual(reviewPageRanges(selected), [{ fromPage: 1, toPage: 3, targetPages: 20 }]);
});
test('multiple gaps never truncate a review, and descending selection keeps its direction', () => {
  assert.deepEqual(pickReviewPages(new Set([1, 2, 10, 11, 20, 21]), 1, 6).pages, [1, 2, 10, 11, 20, 21]);
  assert.deepEqual(pickReviewPages(new Set(Array.from({ length: 20 }, (_, i) => 581 + i)), 600, 5, -1).pages, [600, 599, 598, 597, 596]);
});
test('fractional and repeated quantities are preserved without duplicate database ranges', () => {
  for (const direction of [1, -1]) for (const amount of [0.25, 1, 2.5, 20, 1208]) {
    const selected = pickReviewPages(new Set([1, 2, 10]), direction < 0 ? 10 : 1, amount, direction);
    const ranges = reviewPageRanges(selected);
    assert.equal(ranges.reduce((sum, row) => sum + row.targetPages, 0), amount);
    assert.equal(new Set(ranges.map(row => `${row.fromPage}:${row.toPage}`)).size, ranges.length);
  }
  for (const amount of [0, -1, NaN, Infinity, 1209]) assert.throws(() => pickReviewPages(new Set([1]), 1, amount), RangeError);
  assert.deepEqual(pickReviewPages(new Set(), 1, 20).pages, []);
});
test('a repeated scheduled endpoint cannot silently reduce 20 faces to its first occurrence', () => {
  const ayahs = [1, 2, 3].map(page => ({ page, surah: page, ayah: 1 }));
  const cycle = { ...buildReviewCycle({ ayahs, isAvailable: () => true }), expectedFaces: 20 };
  assert.equal(selectReviewEnd(cycle, { surah: 2, ayah: 1 }).faces, 20);
});
test('linking includes the latest accepted save today and uses its actual end', async () => {
  const end = { page: 553, surah: 63, ayah: 8 };
  const connection = { query: async (sql, args) => {
    assert.match(sql, /teacher_completed = 1/); assert.match(sql, /task_date <= \?/);
    assert.deepEqual(args, [7, 9, 'memorization', '2026-10-19']);
    return [[end]];
  } };
  const result = await latestApprovedLinkAnchor(connection, { id: 7, studentId: 9 }, '2026-10-19',
    async position => ({ ...position, ayah: position.ayah + 1 }), () => assert.fail('do not use scheduled progress'));
  assert.equal(result.ayah, 9);
});
