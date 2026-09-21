import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStudentPointsReport } from '../server/services/studentPointsReport.js';
import { filterStudentPoints } from '../src/lib/studentPointsReport.js';

const options = { from: '2026-09-01', to: '2026-09-08', auth: { role: 'manager', id: 1 }, sourceLabel: value => value };
test('report preserves signed transactions, separates period points from total balance and includes zero activity students', async () => {
  const connection = { query: async () => [[
    { studentId: 1, studentName: 'خالد', balance: 360, id: 1, points: 78, type: 'increase', sourceType: 'attendance' },
    { studentId: 1, studentName: 'خالد', balance: 360, id: 2, points: 5, type: 'deduction', sourceType: 'manual' },
    { studentId: 2, studentName: 'أحمد', balance: 10, id: null },
  ]] };
  const { rows } = await buildStudentPointsReport(connection, options);
  assert.equal(rows[0].total, 73);
  assert.equal(rows[0].increases, 78);
  assert.equal(rows[0].deductions, 5);
  assert.equal(rows[0].balance, 360);
  assert.equal(rows[0].transactions.length, 2);
  assert.equal(rows[1].total, 0);
  assert.deepEqual(filterStudentPoints(rows, '', 'points_asc').map(row => row.studentId), [2, 1]);
  assert.equal(filterStudentPoints(rows, 'خالد')[0].studentId, 1);
  assert.equal(filterStudentPoints(rows, '', 'name')[0].studentName, 'أحمد');
  assert.equal(rows[0].studentId, 1, 'sorting must not mutate report data');
});
test('teacher scope is enforced independently of requested committee and parameters are bound', async () => {
  const connection = { query: async (sql, params) => {
    assert.match(sql, /sc.supervisor_id = \? AND sc.committee_id = s.committee_id/);
    assert.match(sql, /s.committee_id = \?/);
    assert.deepEqual(params, [options.from, options.to, 7, 99]);
    return [[]];
  } };
  await buildStudentPointsReport(connection, { ...options, committeeId: '7', auth: { role: 'supervisor', id: 99 } });
});
test('invalid dates, reversed periods and invalid committee ids fail before querying', async () => {
  const connection = { query: () => { throw new Error('must not query'); } };
  for (const value of [{ from: '2026-02-30' }, { to: '2026-08-01' }, { from: '2020-01-01' }, { committeeId: '1 OR 1=1' }]) {
    await assert.rejects(buildStudentPointsReport(connection, { ...options, ...value }), error => error.status === 422);
  }
});
