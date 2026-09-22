import test from 'node:test';
import assert from 'node:assert/strict';
import { saveManualProgramPoints, saveManualProgramPointsBatch } from '../server/services/manualProgramPoints.js';

function fixture({ questionCount = 0, allowed = true, enabled = true } = {}) {
 let previous;
 const changes = [], ledger = [];
 const connection = { query: async (sql, params) => {
   if (sql.startsWith('SELECT id, title')) return [[{ id: 1, title: 'دورة بصائر', pointsReward: 100 }]];
   if (sql.includes('COUNT(*)')) return [[{ count: questionCount }]];
   if (sql.startsWith('SELECT id, committee')) return [[{ id: 2, committeeId: 3 }]];
   if (sql.includes('supervisor_committees')) return [allowed ? [{ allowed: 1 }] : []];
   if (sql.startsWith('SELECT earned_points')) return [previous === undefined ? [] : [{ earnedPoints: previous }]];
   if (sql.startsWith('INSERT INTO student_path_progress')) { previous = params[2]; return [{ affectedRows: 1 }]; }
   throw new Error(sql);
 } };
 const dependencies = { applyStudentPointDelta: async (_connection, _id, delta) => { changes.push(delta); }, logStudentPointTransaction: async (_connection, entry) => { ledger.push(entry); } };
 return { changes, ledger, save: points => saveManualProgramPoints(connection, { programId: 1, studentId: 2, points, actor: { role: 'supervisor', id: 4 }, settings: { pointsSystemEnabled: enabled }, date: '2026-09-09' }, dependencies) };
}
test('manual program records full or partial points once and applies only corrections', async () => {
 const f = fixture();
 assert.equal((await f.save(100)).awardedPoints, 100);
 assert.equal((await f.save(100)).awardedPoints, 0);
 assert.equal((await f.save(65)).awardedPoints, -35);
 assert.equal((await f.save(0)).awardedPoints, -65);
 assert.deepEqual(f.changes, [100, -35, -65]);
 assert.deepEqual(f.ledger.map(row => row.type), ['increase', 'deduction', 'deduction']);
});
test('manual program rejects excess, negative, invalid grades and out-of-scope students', async () => {
 for (const points of [-1, 101, 1.5, '50', null, NaN]) {
  const f = fixture(); await assert.rejects(f.save(points), { statusCode: 422 }); assert.equal(f.changes.length, 0);
 }
 for (const options of [{ questionCount: 1 }, { allowed: false }, { enabled: false }]) {
  const f = fixture(options); await assert.rejects(f.save(50)); assert.equal(f.changes.length, 0);
 }
});


test('bulk manual points rejects malformed and duplicate rows before any writes', async () => {
  const connection = { query: async () => assert.fail('Invalid batch must not query') };
  for (const grades of [[], null, [{ studentId: 1, points: 5 }, { studentId: 1, points: 6 }], [{ studentId: 1, points: -1 }]]) {
    await assert.rejects(saveManualProgramPointsBatch(connection, { grades }, {}), { statusCode: 422 });
  }
});

test('bulk grades preserve server actor and program context despite payload overrides', async () => {
  const seen = [];
  const connection = { query: async (sql, args) => {
    if (sql.startsWith('SELECT id, title')) { assert.equal(args[0], 9); return [[{ id: 9, title: 'برنامج', pointsReward: 100 }]]; }
    if (sql.includes('COUNT(*)')) return [[{ count: 0 }]];
    if (sql.startsWith('SELECT id, committee')) { seen.push(args[0]); return [[{ id: args[0], committeeId: 7 }]]; }
    if (sql.includes('supervisor_committees')) { assert.equal(args[0], 4); return [[{ allowed: 1 }]]; }
    if (sql.startsWith('SELECT earned_points')) return [[]];
    if (sql.startsWith('INSERT')) return [{}];
    assert.fail(sql);
  } };
  const result = await saveManualProgramPointsBatch(connection, {
    programId: 9, actor: { role: 'supervisor', id: 4 }, settings: { pointsSystemEnabled: true },
    grades: [{ studentId: 2, points: 30, programId: 999, actor: { role: 'admin' } }, { studentId: 1, points: 0 }],
  }, { applyStudentPointDelta: async () => {}, logStudentPointTransaction: async () => {} });
  assert.deepEqual(seen, [1, 2]);
  assert.deepEqual(result.grades.map(row => row.earnedPoints), [0, 30]);
});
