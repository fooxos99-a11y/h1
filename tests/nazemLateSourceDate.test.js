import test from 'node:test';
import assert from 'node:assert/strict';
import { NazemAdapter, mapNazemPendingFollowUps } from '../server/integrations/nazem/adapter.js';
import { findNazemLateSourceDate } from '../server/integrations/nazem/lateSourceDate.js';
import { getBusinessDate } from '../shared/business-date.js';

const late = { id: 4508, available_date: '2026-09-07', source_day_id: 614154, status: 'pending', surah_from: 76, verse_from: 17, surah_to: 76, verse_to: 25 };
const student = { nazemStudentId: '29189' };
const item = { type: 'conserve', late_items: [late] };
const payload = value => ({ data: { students: [{ student_id: 29189, attendance_status: 2, items: [value] }] } });

test('one-day refresh imports the explicit previous pending day for every track with its original identity', async () => {
  for (const type of ['conserve', 'revision', 'master']) {
    const adapter = new NazemAdapter();
    const pending = { id: 123, date: '2026-09-07', status: 'pending', surah_from: 67, verse_from: 13, surah_to: 67, verse_to: 26 };
    adapter.openFollowUp = async () => payload({ id: 32698, type, pending_day: pending, late_items: [],
      is_blocked_by_previous_days: true, today: { ...pending, id: 125, date: getBusinessDate(), verse_from: 27, verse_to: 30 } });
    const history = await adapter.readStudentFollowUpHistory('191', student, 1);
    assert.equal(history.scheduledFollowUps.length, 2);
    assert.ok(history.scheduledFollowUps.every(day => day.nazemItemId === '32698'));
    assert.deepEqual(history.scheduledFollowUps[0], { ...pending, nazemItemId: '32698', remoteType: type,
      taskType: type === 'revision' ? 'review' : 'memorization', attendanceStatus: null,
      nazemLate: false, nazemPendingDay: true, nazemLateAvailableOn: getBusinessDate(),
      nazemQueueDate: getBusinessDate(), nazemActionableDate: pending.date, nazemLinkDate: pending.date });
  }
});

test('remote source_date avoids historical guessing for a late completion', async () => {
  const adapter = new NazemAdapter();
  adapter.openFollowUp = async () => { throw new Error('unnecessary historical lookup'); };
  const result = await adapter.datedLateItems({ ...item, late_items: [{ ...late, source_date: '2026-09-05' }] }, '191', student, 'conserve');
  assert.equal(result[0].date, '2026-09-05');
});

test('retry never redirects an identified attempt to a regenerated id, even with the same range', async () => {
  const adapter = new NazemAdapter();
  adapter.readStudentFollowUp = async () => payload({ type: 'conserve', late_items: [], today: { ...late, id: 999 } });
  const mapped = {
    date: '2026-09-05', remoteType: 'conserve', nazemSourceDayId: 614154,
    fromSurahId: 76, fromAyah: 17, scheduledToSurahId: 76, scheduledToAyah: 25,
  };
  await assert.rejects(adapter.resolveRecitationFollowUp(student, {}, mapped), { code: 'NAZEM_SAVED_TARGET_CHANGED' });
  adapter.readStudentFollowUp = async () => payload({ type: 'conserve', late_items: [], today: { ...late, id: 1000, verse_to: 24 } });
  await assert.rejects(adapter.resolveRecitationFollowUp(student, {}, mapped), { code: 'NAZEM_SAVED_TARGET_CHANGED' });
});

test('historical snapshot cannot replace independent remote verification', async () => {
  const adapter = new NazemAdapter();
  const saved = { ...late, id: 614154, date: '2026-09-05', remoteType: 'conserve' };
  adapter.readStudentFollowUp = async () => payload({ type: 'conserve', late_items: [], today: { ...late, id: 999, verse_to: 24 } });
  await assert.rejects(adapter.resolveRecitationFollowUp(student, {}, {
    date: '2026-09-05', remoteType: 'conserve', nazemSourceDayId: 614154, nazemSavedTarget: saved,
    fromSurahId: 76, fromAyah: 17, scheduledToSurahId: 76, scheduledToAyah: 25,
  }), { code: 'NAZEM_SAVED_TARGET_CHANGED' });
});

test('historical listed target remains verifiable but never skips post-write verification', async () => {
  const adapter = new NazemAdapter();
  const saved = { ...late, id: 614154, date: '2026-09-05', remoteType: 'conserve' };
  adapter.readStudentFollowUp = async (_student, _plan, date) => payload({ type: 'conserve',
    late_items: [], today: date === '2026-09-05' ? saved : { ...late, id: 999, verse_to: 24 } });
  const result = await adapter.resolveRecitationFollowUp(student, {}, {
    date: '2026-09-05', remoteType: 'conserve', nazemSourceDayId: 614154, nazemSavedTarget: saved,
    fromSurahId: 76, fromAyah: 17, scheduledToSurahId: 76, scheduledToAyah: 25,
  });
  assert.equal(result.day.id, 614154);
  assert.equal(result.savedTargetRecovery, undefined);
});

test('same-day snapshot cannot replace a missing remote target', async () => {
  const adapter = new NazemAdapter();
  const date = getBusinessDate();
  const saved = { ...late, id: 614154, date, remoteType: 'conserve' };
  adapter.readStudentFollowUp = async () => payload({ type: 'conserve', late_items: [],
    today: { ...late, id: 999, date, verse_to: 24 } });
  await assert.rejects(adapter.resolveRecitationFollowUp(student, {}, {
    date, remoteType: 'conserve', nazemSourceDayId: 614154, nazemSavedTarget: saved,
    fromSurahId: 76, fromAyah: 17, scheduledToSurahId: 76, scheduledToAyah: 25,
  }), { code: 'NAZEM_SAVED_TARGET_CHANGED' });
});

test('actual Nazem late payload gets its original date and remains before today in a one-day refresh', async () => {
  let lookups = 0;
  const adapter = new NazemAdapter({ resolveLateSourceDate: async scope => {
    assert.equal(scope.sourceDayId, 614154); assert.equal(scope.externalPlanId, '191');
    assert.equal(scope.studentLink.nazemStudentId, '29189'); lookups++;
    return '2026-09-06';
  } });
  adapter.openFollowUp = async () => payload({ ...item, today: { id: 614155, status: 'pending', surah_from: 76, verse_from: 26, surah_to: 75, verse_to: 4 } });
  const history = await adapter.readStudentFollowUpHistory('191', student, 1);
  assert.equal(history.scheduledFollowUps.length, 2);
  const imported = history.scheduledFollowUps[0];
  assert.equal(imported.date, '2026-09-06');
  assert.equal(imported.id, 4508);
  assert.equal(imported.source_day_id, 614154);
  assert.equal(imported.nazemLate, true);
  assert.equal(imported.nazemLateAvailableOn, getBusinessDate());
  assert.equal(imported.verse_from, 17); assert.equal(imported.verse_to, 25);
  await adapter.datedLateItems(item, '191', student, 'conserve');
  assert.equal(lookups, 1);
});

test('uncached original date is resolved only by exact source day identity, not matching range or availability', async () => {
  const adapter = new NazemAdapter(); const dates = [];
  adapter.openFollowUp = async (_plan, date) => {
    dates.push(date);
    return payload({ ...item, today: { ...late, id: date === '2026-09-06' ? 614154 : 123 } });
  };
  const result = await adapter.datedLateItems(item, '191', student, 'conserve');
  assert.equal(result[0].date, '2026-09-06');
  assert.deepEqual(dates, ['2026-09-07', '2026-09-06']);
  assert.equal(mapNazemPendingFollowUps({ ...item, late_items: result }, { remoteType: 'conserve' }).length, 1);
});

test('missing source day surfaces review instead of silently dropping a late task or guessing its date', async () => {
  const adapter = new NazemAdapter(); let requests = 0;
  adapter.openFollowUp = async () => { requests++; return payload({ ...item, today: { id: 999, status: 'pending' } }); };
  await assert.rejects(adapter.datedLateItems(item, '191', student, 'conserve'), { code: 'NAZEM_LATE_SOURCE_MISSING' });
  assert.equal(requests, 14);
});

test('local source lookup is scoped to teacher, external student, plan and track, including a previously imported late snapshot', async () => {
  let captured;
  const scope = { teacherId: 12, externalPlanId: '191', studentLink: student, remoteType: 'conserve', sourceDayId: 614154 };
  const connection = { query: async (sql, args) => { captured = { sql, args }; return [[{ date: '2026-09-06' }]]; } };
  assert.equal(await findNazemLateSourceDate(connection, scope), '2026-09-06');
  assert.deepEqual(captured.args, [12, '191', '29189', 'memorization', 'memorization', '614154', '614154']);
  assert.match(captured.sql, /source_day_id/);
  await assert.rejects(findNazemLateSourceDate({ query: async () => [[{ date: '2026-09-05' }, { date: '2026-09-06' }]] }, scope), { code: 'NAZEM_LATE_SOURCE_AMBIGUOUS' });
});

test('same range on different source days stays associated with its own date', async () => {
  const adapter = new NazemAdapter({ resolveLateSourceDate: async ({ sourceDayId }) => sourceDayId === 614154 ? '2026-09-06' : '2026-09-05' });
  const result = await adapter.datedLateItems({ ...item, late_items: [late, { ...late, id: 4509, source_day_id: 614153 }] }, '191', student, 'conserve');
  assert.deepEqual(result.map(row => row.date), ['2026-09-06', '2026-09-05']);
});
