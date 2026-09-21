import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecitationSegmentDetails, recitationFacesFromLines } from '../server/services/recitationSegments.js';
import { calculateSegmentedPlanPoints } from '../server/services/quranPlanProgress.js';
import { descendingRecitationLines } from '../server/services/quranFaceMeasurement.js';
import { auditDescendingRewards } from '../server/services/descendingRewardAudit.js';

const settings = { allowQuranCompensation: false, allowQuranExtra: true };
const start = { surah: 57, ayah: 29 };
const end = { surah: 56, ayah: 6 };
test('Hadid to Waqiah counts six recited lines instead of 108 intervening lines', async () => {
  const segments = await buildRecitationSegmentDetails(null,
    { actualStart: start, normalEnd: end, scheduledEnd: end, direction: -1 }, end, settings);
  assert.equal(descendingRecitationLines(start, end), 6);
  assert.equal(segments[0].amount, 0.4);
  assert.equal(calculateSegmentedPlanPoints({ basePoints: 20, dailyAmount: 0.5, segments }).total, 16);
  assert.equal(recitationFacesFromLines(start, end), 0.5);
});

test('descending extra segments continue after the last counted verse without measuring intervening pages', async () => {
  const extraEnd = { surah: 56, ayah: 8 };
  const segments = await buildRecitationSegmentDetails(null,
    { actualStart: start, normalEnd: start, scheduledEnd: start, direction: -1 }, extraEnd, settings,
    { adjacentPosition: async () => ({ surah: 56, ayah: 1 }) });
  assert.equal(segments.length, 2);
  assert.equal(segments[0].amount, 0.2);
  assert.equal(segments[1].amount, Number((descendingRecitationLines({ surah: 56, ayah: 1 }, extraEnd, start) / 15).toFixed(2)));
  assert.ok(segments[1].amount < 1);
});

test('same-surah calculations and missing-layout fallback remain supported', async () => {
  const same = { surah: 1, ayah: 1 }, last = { surah: 1, ayah: 7 };
  const segments = await buildRecitationSegmentDetails(null,
    { actualStart: same, normalEnd: last, scheduledEnd: last, direction: 1 }, last, settings);
  assert.equal(segments[0].amount, 0.47);
  assert.equal(descendingRecitationLines({ surah: 999, ayah: 1 }, end), null);
  assert.equal(recitationFacesFromLines({ surah: 999, ayah: 1 }, end), null);
});

test('historical audit proposes only the reproduced excess and never mutates the source rows', async () => {
  const row = { id: 1, studentId: 2, studentName: 'طالب اختبار', planId: 3, taskDate: '2026-09-09',
    track: 'memorization', fromSurah: 57, fromAyah: 29, toSurah: 56, toAyah: 6,
    teacherCompleted: 1, evaluatedAt: '2026-09-09', dailyPages: 0.5,
    evaluationScore: 20, points: 288, ledgerPoints: 288 };
  const [result] = await auditDescendingRewards([row]);
  assert.equal(result.correctedPoints, 16);
  assert.equal(result.proposedDeduction, 272);
  assert.equal(result.status, 'requires_review');
  assert.equal(row.points, 288);
  const again = await auditDescendingRewards([row]);
  assert.deepEqual(again, [result]);
  for (const change of [{ ledgerPoints: 200 }, { points: 16, ledgerPoints: 16 },
    { actualToSurah: 56, actualToAyah: 4 }, { dailyPages: null }, { teacherCompleted: 0 }]) {
    assert.equal((await auditDescendingRewards([{ ...row, ...change }]))[0].proposedDeduction, null);
  }
  assert.deepEqual(await auditDescendingRewards([{ ...row, fromSurah: 56, fromAyah: 1 }]), []);
});
