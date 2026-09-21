import assert from 'node:assert/strict';
import test from 'node:test';
import { memorizedSegments } from '../server/services/memorizedSegments.js';
import { studentHomePlan, studentJourneySummary, studentHomeFeatures } from '../src/lib/studentHome.js';
import { studentPlanLevel } from '../src/lib/studentPlanLevel.js';

test('plan level measures completed quantities for both local and Nazem plans', () => {
  for (const nazemManaged of [true, false]) {
    assert.equal(studentPlanLevel({ nazemManaged, totalAyahs: 400, completedAyahs: 100, progressPercent: 80 }), 25);
    assert.equal(studentPlanLevel({ nazemManaged, totalAyahs: 1000, completedAyahs: 999, progressPercent: 100 }), 99);
    assert.equal(studentPlanLevel({ nazemManaged, totalAyahs: 1000, completedAyahs: 1000 }), 100);
    assert.equal(studentPlanLevel({ nazemManaged, totalPages: 20, completedPages: 5 }), 25);
  }
});

test('a new plan resets its level and missing or rounded progress never invents completion', () => {
  assert.equal(studentPlanLevel({ id: 2, totalAyahs: 400, completedAyahs: 0 }), 0);
  assert.equal(studentPlanLevel(null), 0);
  assert.equal(studentPlanLevel({ progressPercent: 100 }), 99);
  assert.equal(studentPlanLevel({ progressPercent: 100, status: 'completed' }), 100);
  assert.equal(studentPlanLevel({ progressPercent: 'invalid' }), 0);
  assert.equal(studentPlanLevel({ totalPages: 20, completedPages: -5 }), 0);
});

test('memorized ranges preserve gaps, page transitions and surah boundaries', () => {
  const ayahs = [1, 2, 3, 4, 5].map((ayah) => ({ surah: 2, surahName: 'البقرة', ayah, page: ayah < 5 ? 2 : 3 }));
  ayahs.push({ surah: 3, surahName: 'آل عمران', ayah: 1, page: 50 });
  const ranges = memorizedSegments(ayahs, (item) => item.ayah !== 3);
  assert.equal(ranges.length, 3);
  assert.deepEqual(ranges.map((r) => [r.fromSurah, r.fromAyah, r.toSurah, r.toAyah]), [[2, 1, 2, 2], [2, 4, 2, 5], [3, 1, 3, 1]]);
  assert.equal(ranges[1].fromPage, 2);
  assert.equal(ranges[1].toPage, 3);
  assert.deepEqual(memorizedSegments(ayahs, () => false), []);
});

test('home plan never shows a previous business day as today', () => {
  assert.deepEqual(studentHomePlan({ date: '2026-09-07', tasks: [{ taskType: 'memorization', studentStatus: 'done' }] }, '2026-09-08'), { groups: [], percent: 0 });
});

test('home groups all real ranges, preserving separate Mushaf targets', () => {
  const make = (page, status) => ({ taskType: 'memorization', studentStatus: status, fromPage: page, toPage: page, fromSurah: 2, toSurah: 2, fromAyah: page, toAyah: page + 1 });
  const model = studentHomePlan({ date: '2026-09-08', plan: { track: 'mastery' }, todayAmounts: [make(3, 'done'), make(6, null), { ...make(9, null), taskType: 'review', teacherCompleted: true }] }, '2026-09-08');
  assert.equal(model.percent, 67);
  assert.equal(model.groups[0].label, 'الإتقان');
  assert.equal(model.groups[0].complete, false);
  assert.deepEqual(model.groups[0].target.ranges.map((range) => range.page), [3, 6]);
  assert.equal(model.groups[1].complete, true);
});

test('journey summary uses actual configured goal and milestones', () => {
  assert.equal(studentJourneySummary(null), null);
  const summary = studentJourneySummary({ points: 400, totalKilometers: 800, stages: [{ points: 600 }, { points: 200 }] });
  assert.equal(summary.percent, 50);
  assert.equal(summary.next.points, 600);
  assert.equal(studentJourneySummary({ points: 1000, totalKilometers: 800 }).percent, 100);
});

test('home journey distance follows earned points even when a global station is at zero', () => {
  const summary = studentJourneySummary({
    points: 5,
    displayedKilometers: 0,
    activeStation: { kilometer: 0 },
    totalKilometers: 8000,
  });
  assert.equal(summary.kilometers, 5);
});

test('when execution is disabled only teacher completion counts toward today', () => {
  const today = { date: '2026-09-08', tasks: [
    { taskType: 'memorization', studentStatus: 'done', teacherCompleted: false },
    { taskType: 'review', studentStatus: null, teacherCompleted: false },
    { taskType: 'link', studentStatus: null, teacherCompleted: false },
  ] };
  assert.equal(studentHomePlan(today, today.date, false).percent, 0);
  assert.equal(studentHomePlan(today, today.date, false).groups[0].complete, false);
  assert.equal(studentHomePlan(today, today.date, true).percent, 33);
  today.tasks[1].teacherCompleted = true;
  assert.equal(studentHomePlan(today, today.date, false).percent, 33);
  assert.equal(studentHomePlan(today, today.date, false).groups[1].complete, true);
});

test('student home uses the real feature settings and site restrictions', () => {
  const off = studentHomeFeatures({}, {}, { showPath: false, showDailyChallenge: false });
  assert.equal(off.programs, false);
  assert.equal(off.store, false);
  assert.equal(off.journey, false);
  assert.equal(off.challenge, false);
  const on = studentHomeFeatures({ learningPathsEnabled: true, storeEnabled: true, pointsSystemEnabled: true }, { store: true });
  assert.equal(on.programs, true);
  assert.equal(on.store, true);
  assert.equal(studentHomeFeatures({ storeEnabled: true, pointsSystemEnabled: true }, { store: false }).store, false);
  assert.equal(studentHomeFeatures({ storeEnabled: true, pointsSystemEnabled: false }).store, false);
});
