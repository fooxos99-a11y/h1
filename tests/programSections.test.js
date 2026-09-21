import test from 'node:test';
import assert from 'node:assert/strict';
import { groupProgramSections } from '../shared/program-sections.js';
import { normalizePayload } from '../server/routes/programRoutes.js';
import { saveProgramSections } from '../server/services/programSections.js';

const child = { title: 'قسم', pointsReward: 12, contents: [{ type: 'text', value: 'محتوى' }], questions: [] };
test('sections retain independent rewards and do not grant a parent award', () => {
  const payload = normalizePayload({ title: 'برنامج', sectionsEnabled: true, pointsReward: 900, sections: [child, { ...child, allowMultipleAttempts: true }] });
  assert.equal(payload.pointsReward, 0);
  assert.equal(payload.sections[1].allowMultipleAttempts, false);
  assert.equal(payload.sections[0].pointsReward, 12);
  assert.throws(() => normalizePayload({ title: 'برنامج', sectionsEnabled: true, sections: [] }));
  assert.throws(() => normalizePayload({ title: 'برنامج', sectionsEnabled: true, sections: [{ ...child, sectionsEnabled: true, sections: [child] }] }));
  assert.deepEqual(normalizePayload({ ...child, contents: [] }).contents, []);
  assert.equal(normalizePayload({ ...child, allowMultipleAttempts: true }).allowMultipleAttempts, true);
});
test('student listing groups children and sums each earned reward once', () => {
  const result = groupProgramSections([{ id: 1, sectionsEnabled: true },
    { id: 2, parentPathId: 1, pointsReward: 12, earnedPoints: 12, completedAt: '2026-09-11' },
    { id: 3, parentPathId: 1, pointsReward: 20, earnedPoints: 0, completedAt: null },
    { id: 4, pointsReward: 7, earnedPoints: 0 }]);
  assert.equal(result.length, 2);
  assert.equal(result[0].pointsReward, 32);
  assert.equal(result[0].earnedPoints, 12);
  assert.equal(result[0].completedAt, null);
  assert.equal(result[1].sectionsEnabled, false);
  assert.equal(groupProgramSections([{ id: 1, sectionsEnabled: true }])[0].sectionsEnabled, true);
});
test('section updates reject foreign identifiers and deletion of completed sections', async () => {
  const calls = [];
  const connection = { query: async sql => {
    calls.push(sql);
    if (sql.startsWith('SELECT id')) return [[{ id: 2 }]];
    if (sql.startsWith('SELECT student_id')) return [[{ student_id: 7 }]];
    return [{}];
  } };
  await assert.rejects(saveProgramSections(connection, 1, [{ ...child, id: 99 }], async () => {}), /غير صالح/);
  await assert.rejects(saveProgramSections(connection, 1, [{ ...child, id: 'invalid' }], async () => {}), /غير صالح/);
  await assert.rejects(saveProgramSections(connection, 1, [], async () => {}), /له نتائج/);
  assert.ok(calls.every(sql => !sql.startsWith('DELETE')));
});

test('editing sections preserves progress identifiers and forces one quiz attempt per section', async () => {
  const updated = [], replaced = [];
  const connection = { query: async (sql, params) => {
    if (sql.startsWith('SELECT id')) return [[{ id: 2 }]];
    if (sql.startsWith('UPDATE learning_paths')) { updated.push({ sql, params }); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('INSERT INTO learning_paths')) return [{ insertId: 3 }];
    throw new Error(`Unexpected mutation: ${sql}`);
  } };
  await saveProgramSections(connection, 1, [{ ...child, id: 2 }, child], async (_connection, id) => replaced.push(id));
  assert.deepEqual(replaced, [2, 3]);
  assert.match(updated[0].sql, /allow_multiple_attempts = 0/);
  assert.deepEqual(updated[0].params.slice(-2), [2, 1]);
});
