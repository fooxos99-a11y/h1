import test from 'node:test';
import assert from 'node:assert/strict';
import { loadOverviewStudentAttendanceWindow, studentAttendanceCutoff, studentAttendanceWindow } from '../server/services/overviewStudentAttendance.js';
import { createOverviewReportScope } from '../server/services/overviewReportScope.js';

test('year attendance starts at recorded participation, not January or the import date', () => {
  const result = studentAttendanceWindow([
    { studentId: 1, firstAttendanceDate: '2026-08-25', createdAt: '2026-09-13' },
    { studentId: 2, firstAttendanceDate: '2026-09-13' },
    { studentId: 3, firstAttendanceDate: null },
  ], { from: '2026-01-01', to: '2026-10-01', weekdays: [0, 3] });
  assert.equal(result.expectedByStudent.get('1'), 11);
  assert.equal(result.expectedByStudent.get('2'), 6);
  assert.equal(result.expectedByStudent.get('3'), 0);
  assert.equal(result.totalExpected, 17);
  assert.equal(result.dates.length, 11);
});

test('missing dates after the first recorded participation remain expected', () => {
  const result = studentAttendanceWindow([{ studentId: 1, firstAttendanceDate: '2026-09-06' }], {
    from: '2026-09-01', to: '2026-09-13', weekdays: [0, 3],
  });
  assert.deepEqual(result.dates, ['2026-09-06', '2026-09-09', '2026-09-13']);
  assert.equal(result.totalExpected, 3);
});

test('custom ranges respect their start and empty or future ranges have no expected attendance', () => {
  const rows = [{ studentId: 1, firstAttendanceDate: '2026-08-25' }];
  assert.equal(studentAttendanceWindow(rows, { from: '2026-09-20', to: '2026-09-30', weekdays: [0, 3] }).totalExpected, 4);
  assert.equal(studentAttendanceWindow(rows, { from: '2026-10-02', to: '2026-10-01', weekdays: [0, 3] }).totalExpected, 0);
  assert.equal(studentAttendanceWindow([], { from: '2026-01-01', to: '2026-10-01', weekdays: [0, 3] }).totalExpected, 0);
});

test('today is counted only after the session starts, and future days never count', () => {
  const settings = { attendanceStartTime: '16:00' };
  assert.equal(studentAttendanceCutoff('2026-12-31', settings, { date: '2026-09-30', time: '15:59:59' }), '2026-09-29');
  assert.equal(studentAttendanceCutoff('2026-12-31', settings, { date: '2026-09-30', time: '16:00:00' }), '2026-09-30');
  assert.equal(studentAttendanceCutoff('2026-09-20', settings, { date: '2026-09-30', time: '15:00:00' }), '2026-09-20');
  assert.equal(studentAttendanceCutoff('2026-12-31', settings, { date: '2026-09-30', time: '01:00:00' }), '2026-09-30', 'after midnight still belongs to the completed previous business day');
});

test('participation lookup keeps the supervisor and committee authorization scope', async () => {
  let sqlUsed;
  let paramsUsed;
  const scope = createOverviewReportScope({ query: async (sql, params) => {
    sqlUsed = sql; paramsUsed = params;
    return [[{ studentId: 1, firstAttendanceDate: '2026-09-06' }]];
  } }, { auth: { role: 'supervisor', id: 12 }, committeeId: 4 });
  const result = await loadOverviewStudentAttendanceWindow(scope, {
    from: '2026-01-01', to: '2026-12-31', weekdays: [0, 3], settings: { attendanceStartTime: '16:00' }, now: { date: '2026-09-30', time: '15:00:00' },
  });
  assert.match(sqlUsed, /supervisor_committees/);
  assert.ok(paramsUsed.includes(12) && paramsUsed.includes(4) && paramsUsed.includes('2026-09-29'));
  assert.equal(result.to, '2026-09-29');
  assert.throws(() => createOverviewReportScope({}, { auth: { role: 'supervisor', id: 0 } }), /غير صالح/);
});
