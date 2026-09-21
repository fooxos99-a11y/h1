import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStudentPlanPoints } from '../server/services/studentPlanPoints.js';
import { buildStudentPlanWeeks } from '../src/lib/studentPlan.js';
const today = '2026-09-07';
const task = { id: 1, planId: 1, taskDate: today, taskType: 'memorization', track: 'memorization', pointsMaximum: 20 };
const settings = { attendancePoints: 25, memorizationRepeatCount: 0, memorizationListeningCount: 0 };
const build = (extra = {}) => buildStudentPlanPoints({ total: 1234, rows: [task], attendance: [], transactions: [], settings, today, ...extra });
test('daily total uses actual ledger awards and the configured maximum, without a store balance', () => {
  const result = build({ transactions: [{ date: today, points: 25, source: 'attendance', type: 'increase' },
    { date: today, points: 18, source: 'quran_evaluation', type: 'increase' }] });
  assert.equal(result.total, 1234);
  assert.equal(result.days[0].earned, 43); assert.equal(result.days[0].maximum, 45);
  assert.equal(result.days[0].pending, false);
});
test('split passages share one category maximum and pending evaluations are not reported as a zero grade', () => {
  const result = build({ rows: [task, { ...task, id: 2 }] });
  assert.equal(result.days[0].maximum, 45); assert.equal(result.days[0].pending, true);
});
test('deductions remain visible and attendance-only previous days are included', () => {
  const result = build({ transactions: [{ date: '2026-09-06', points: 25, source: 'attendance', type: 'increase' },
    { date: '2026-09-06', points: 5, source: 'manual', type: 'deduction' }] });
  const prior = result.days.find(day => day.date === '2026-09-06');
  assert.equal(prior.earned, 20); assert.equal(prior.details[1].earned, -5);
  const weeks = buildStudentPlanWeeks({ today, points: result });
  assert.equal(weeks.flatMap(week => week.days).find(day => day.date === prior.date).points.earned, 20);
});
test('future entries never receive displayed points', () => {
  const result = build({ rows: [{ ...task, taskDate: '2026-09-08' }], transactions: [{ date: '2026-09-08', points: 25 }] });
  assert.equal(result.days.length, 0);
});

test('legacy daily cap does not replace category maxima and bonus awards', () => {
  const result = build({ settings: { ...settings, maxDailyStudentPoints: 78 },
    transactions: [{ date: today, points: 122, source: 'manual', type: 'increase' }] });
  assert.equal(result.days[0].maximum, 167);
  assert.equal(result.days[0].earned, 122);
});

test('multiple plans cannot multiply the daily category maximum', () => {
  const result = build({ rows: [task, { ...task, id: 2, planId: 8 }] });
  assert.equal(result.days[0].maximum, 45);
});

test('execution uses configured counts only when enabled, including Nazem plans', () => {
  const executionSettings = { ...settings, memorizationRepeatCount: 10, memorizationRepeatPointValue: 1,
    memorizationListeningCount: 3, memorizationListeningPointValue: 2 };
  assert.equal(build({ settings: executionSettings }).days[0].maximum, 45);
  const result = build({ rows: [{ ...task, nazemSource: 1 }], settings: { ...executionSettings, hasStudentQuranExecution: true } });
  assert.equal(result.days[0].maximum, 61);
});
