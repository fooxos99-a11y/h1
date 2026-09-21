import test from 'node:test';
import assert from 'node:assert/strict';
import { saveAttendanceWithPoints } from '../server/services/attendancePoints.js';

function memoryConnection() {
  const state = { points: 100, store: 70, family: 100, attendance: null, ledger: 0 };
  return { state, async query(sql, values = []) {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT id FROM students')) return [[{ id: 1 }]];
    if (q.startsWith('SELECT status, points FROM attendance_records')) return [[...(state.attendance ? [state.attendance] : [])]];
    if (q.startsWith('SELECT points, committee_id')) return [[{ points: state.points, committeeId: 1 }]];
    if (q.startsWith('UPDATE students')) { state.points = values[0]; state.store = Math.max(0, state.store + values[1]); return [{}]; }
    if (q.startsWith('UPDATE committees')) { state.family += values[0]; return [{}]; }
    if (q.startsWith('INSERT INTO attendance_records')) { state.attendance = { status: values[2], points: values[4] }; return [{}]; }
    if (q.startsWith('INSERT INTO student_point_transactions')) { state.ledger = values[5]; return [{}]; }
    if (q.startsWith('DELETE FROM student_point_transactions')) { state.ledger = 0; return [{}]; }
    if (q.startsWith('SELECT GREATEST')) return [[{ total: 100 + state.ledger }]];
    if (q.includes('AS awardedToday')) return [[{ awardedToday: state.ledger }]];
    throw new Error(`Unexpected query: ${q}`);
  } };
}
const settings = { attendancePoints: 25, manualLateAttendancePoints: 5,
  studentPointsAddToFamily: true, familyPointsAddToStudents: false };
const save = (db, status, options = {}) => saveAttendanceWithPoints(db,
  { studentId: 1, date: '2026-09-07', status }, { ...settings, ...options });

test('imported present attendance grants once and repeated refresh never doubles balances', async () => {
  const db = memoryConnection();
  db.state.attendance = { status: 'present', points: 0 };
  await save(db, 'present'); await save(db, 'present');
  assert.deepEqual(db.state, { points: 125, store: 95, family: 125, ledger: 25, attendance: { status: 'present', points: 25 } });
});

test('late and absent replace the same daily award, and returning to present restores only its difference', async () => {
  const db = memoryConnection();
  for (const [status, expected] of [['present',25],['late',5],['late',5],['absent',0],['absent',0],['present',25]]) {
    await save(db, status);
    assert.equal(db.state.points, 100 + expected);
    assert.equal(db.state.store, 70 + expected);
    assert.equal(db.state.family, 100 + expected);
    assert.equal(db.state.ledger, expected);
  }
});

test('zero late award and disabled family propagation respect settings', async () => {
  const db = memoryConnection();
  const options = { manualLateAttendancePoints: 0, studentPointsAddToFamily: false };
  await save(db, 'present', options); await save(db, 'late', options);
  assert.equal(db.state.points, 100); assert.equal(db.state.store, 70); assert.equal(db.state.family, 100);
});

test('legacy daily limits do not block attendance awards', async () => {
  const db = memoryConnection();
  await save(db, 'present', { maxDailyStudentPoints: 10 });
  assert.equal(db.state.attendance.status, 'present'); assert.equal(db.state.points, 125); assert.equal(db.state.ledger, 25);
});

test('historical import does not create retroactive awards but can retract a previously awarded day', async () => {
  const db = memoryConnection();
  await saveAttendanceWithPoints(db, { studentId: 1, date: '2026-09-01', status: 'present', awardNewPoints: false }, settings);
  assert.equal(db.state.points, 100);
  await save(db, 'present');
  await saveAttendanceWithPoints(db, { studentId: 1, date: '2026-09-07', status: 'absent', awardNewPoints: false }, settings);
  assert.equal(db.state.points, 100);
});
