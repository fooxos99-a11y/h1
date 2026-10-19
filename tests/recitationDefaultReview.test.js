import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureDefaultReviewExecution } from '../server/services/recitationDefaultReview.js';
import { buildReviewCycle, parseReviewExecution } from '../shared/quran-review-cycle.js';
import { reviewStartFromHistory } from '../server/services/quranReviewSchedule.js';

test('a default count-only review persists all 20 occurrences and advances from the true last occurrence', async () => {
  const rows = [{ id: 1, targetPages: 10 }, { id: 2, targetPages: 10 }];
  const writes = [];
  const connection = { query: async (sql, args) => {
    if (sql.startsWith('SELECT')) return [rows];
    writes.push({ sql, args }); return [];
  } };
  const ayahs = [2, 3, 10].map(page => ({ page, surah: 2, ayah: page }));
  const task = { id: 1, planId: 7, studentId: 9, taskDate: '2026-10-19', taskType: 'review' };
  await ensureDefaultReviewExecution(connection, task, async () => ({ ...buildReviewCycle({ ayahs, isAvailable: () => true }), expectedFaces: 20 }));
  const selection = parseReviewExecution(task.reviewExecution);
  assert.equal(selection.faces, 20);
  assert.equal(selection.next.page, 10);
  assert.equal(writes.length, 2);
  assert.equal(JSON.parse(writes[1].args[0]).anchorId, 1);
  assert.equal(reviewStartFromHistory([{ taskDate: task.taskDate, teacherCompleted: 1, reviewExecution: selection }], 2), 10);
  assert.equal(reviewStartFromHistory([{ taskDate: task.taskDate, teacherCompleted: 0, reviewExecution: selection }], 2), 2);
  assert.ok(writes.every(({ sql }) => !/student_status|teacher_completed|points|executed_at/.test(sql)));
});

test('a stored partial route and historical approval cannot be replaced by the default amount', async () => {
  const path = { faces: 1, ranges: [{ start: { page: 2, surah: 2, ayah: 1 }, end: { page: 2, surah: 2, ayah: 5 } }] };
  const writes = [];
  const rows = [{ id: 1, reviewExecution: JSON.stringify(path) }, { id: 2 }];
  const db = { query: async (sql, args) => sql.startsWith('SELECT') ? [rows] : (writes.push(args), []) };
  await ensureDefaultReviewExecution(db, { id: 2, studentId: 9, taskType: 'review' }, () => assert.fail('preserve the chosen path'));
  assert.equal(JSON.parse(writes[0][0]).faces, 1);
  rows[0].teacherCompleted = 1; writes.length = 0;
  await ensureDefaultReviewExecution(db, { id: 2, studentId: 9, taskType: 'review' }, () => assert.fail('preserve history'));
  assert.equal(writes.length, 0);
});

test('corrupt, empty and nonfinite review metadata cannot crash or enter execution', () => {
  for (const value of ['{', { faces: 20, ranges: [] }, { faces: Infinity, ranges: [{}] },
    { faces: 1, ranges: [{ start: { page: 0 }, end: {} }] }, { faces: 0, ranges: [], anchorId: 1 }]) {
    assert.equal(parseReviewExecution(value), null);
  }
});
