import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { NazemAdapter } from '../server/integrations/nazem/adapter.js';
import { mapRuwasiRecitationGroupToNazem } from '../server/integrations/nazem/mapping.js';
import { compareQuranPositionInDirection as compare, orderQuranRangesBeforePosition } from '../shared/quran-execution-policy.js';

const pos = (page) => ({ page, surah: 2, ayah: page });
const range = (start, end) => ({ startPage: start, endPage: end, startSurah: 2, endSurah: 2, startAyah: start, endAyah: end });
const startOf = (r) => ({ page: r.startPage, surah: r.startSurah, ayah: r.startAyah });
const endOf = (r) => ({ page: r.endPage, surah: r.endSurah, ayah: r.endAyah });
const inside = (p, r) => compare(p, startOf(r)) >= 0 && compare(p, endOf(r)) <= 0;
const server = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');

async function latestRanges(saved, target) {
  const ayahs = Array.from({ length: 10 }, (_, i) => pos(i + 1));
  const context = vm.createContext({
    getStudentMemorizedRanges: async () => saved,
    addUtcDays: (date) => date,
    expandQuranTraversalRange: async () => [range(1, 10)],
    getQuranRangeStart: startOf, getQuranRangeEnd: endOf,
    compareQuranPosition: compare, compareQuranPositionInDirection: compare,
    getQuranRangeDirection: () => 1,
    isValidQuranPosition: () => true,
    mergeQuranRanges: async (_connection, ranges) => ranges,
    orderQuranRangesBeforePosition,
    canonicalizeQuranRange: (r) => r,
    getQuranAyahsInPageRange: async (_connection, from, to) => ayahs.filter((a) => a.page >= from && a.page <= to),
    quranPositionInRange: inside,
    buildQuranPageFaceStats: () => ({}),
    calculateQuranRangeFacesFromLines: (start, end) => end.page - start.page + 1,
    calculateQuranRangeFaces: async (_connection, r) => r.endPage - r.startPage + 1,
    roundQuranFaces: (n) => n,
  });
  vm.runInContext(server.slice(server.indexOf('async function buildExactLinkRanges('), server.indexOf('async function ensureNazemLinkTasks(')), context);
  return JSON.parse(JSON.stringify(await context.getNazemLinkRanges({}, {
    id: 1, studentId: 1, ...range(1, 10), linkPages: target, track: 'memorization',
  }, '2026-09-05')));
}

test('configured five faces with one memorized face exposes only that face', async () => {
  assert.deepEqual(await latestRanges([range(1, 1)], 5), [{ ...range(1, 1), faces: 1 }]);
});
test('configured five faces uses the latest five of eight saved faces', async () => {
  assert.deepEqual(await latestRanges([range(1, 8)], 5), [{ ...range(4, 8), faces: 5 }]);
});
test('link ranges never invent a missing face and return none when disabled or empty', async () => {
  assert.deepEqual(await latestRanges([range(1, 2), range(4, 6)], 5), [{ ...range(1, 2), faces: 2 }, { ...range(4, 6), faces: 3 }]);
  assert.deepEqual(await latestRanges([], 5), []);
  assert.deepEqual(await latestRanges([range(1, 8)], 0), []);
});
test('Nazem count is independent of local errors, warnings, points and pass threshold', () => {
  const mapped = mapRuwasiRecitationGroupToNazem([
    { id: 1, taskId: 2, taskType: 'link', taskDate: '2026-09-05', linkCount: 1,
      mistakeCount: 90, warningCount: 90, evaluationScore: 0, teacherCompleted: false },
  ]);
  assert.equal(mapped.linkCount, 1);
  assert.equal(mapped.completed, true);
  assert.equal(Object.hasOwn(mapped, 'mistakeCount'), false);
  assert.equal(Object.hasOwn(mapped, 'score'), false);
});

function adapterFixture(status = 'completed', initialCount = 5) {
  let day = { id: 10, status, link: initialCount, mistake: 3, hearing: 1, repetition: 7, actual_surah_to: 2, actual_verse_to: 30 };
  const calls = [];
  const adapter = Object.create(NazemAdapter.prototype);
  adapter.openFollowUp = async () => ({ students: [{ student_id: 1, attendance_status: 2, items: [{ type: 'conserve', today: { ...day } }] }] });
  adapter.postFollowUpApi = async (url, body) => { calls.push({ url, body }); day = { ...day, link: body.link }; };
  return { adapter, calls };
}
test('independent link sync changes only count, preserves memorization and is idempotent', async () => {
  const { adapter, calls } = adapterFixture();
  const mapped = { taskType: 'link', date: '2026-09-05', linkCount: 1 };
  await adapter.submitRecitation({ nazemStudentId: 1 }, { nazemPlanId: 2 }, mapped);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, { actual_end_surah: 2, actual_end_aya: 30, mistake: 3, hearing: 1, repetition: 7, attendance_status: 2, link: 1 });
  const again = await adapter.submitRecitation({ nazemStudentId: 1 }, { nazemPlanId: 2 }, mapped);
  assert.equal(again.alreadyRecorded, true);
  assert.equal(calls.length, 1);
});
test('not executed sends zero without changing a completed memorization to not completed', async () => {
  const { adapter, calls } = adapterFixture();
  await adapter.submitRecitation({ nazemStudentId: 1 }, { nazemPlanId: 2 }, { taskType: 'link', date: '2026-09-05', linkCount: 0 });
  assert.match(calls[0].url, /\/partial$/);
  assert.equal(calls[0].body.link, 0);
});
test('pending memorization is never marked completed or not completed just to update linking', async () => {
  const { adapter, calls } = adapterFixture('pending', 0);
  await assert.rejects(adapter.submitRecitation({ nazemStudentId: 1 }, { nazemPlanId: 2 }, { taskType: 'link', date: '2026-09-05', linkCount: 1 }), /ينتظر تسجيل الحفظ/);
  assert.equal(calls.length, 0);
});

test('a lost response after Nazem saved linking does not send the count twice', async () => {
  const { adapter, calls } = adapterFixture();
  const save = adapter.postFollowUpApi;
  adapter.postFollowUpApi = async (...args) => {
    await save(...args);
    throw new Error('Connection lost after remote commit');
  };
  const mapped = { taskType: 'link', date: '2026-09-05', linkCount: 1 };
  await assert.rejects(adapter.submitRecitation({ nazemStudentId: 1 }, { nazemPlanId: 2 }, mapped), /Connection lost/);
  const receipt = await adapter.submitRecitation({ nazemStudentId: 1 }, { nazemPlanId: 2 }, mapped);
  assert.equal(receipt.alreadyRecorded, true);
  assert.equal(calls.length, 1);
});
