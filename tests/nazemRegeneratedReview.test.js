import test from 'node:test';
import assert from 'node:assert/strict';
import { NazemAdapter } from '../server/integrations/nazem/adapter.js';
import { applyRecitationWriteIdentity } from '../server/integrations/nazem/recitationSubmission.js';
import { submitWithNazemAuthority } from '../server/integrations/nazem/recitationAuthority.js';
import { getBusinessDate, shiftDateOnly } from '../shared/business-date.js';

const fixture = () => {
  const date = getBusinessDate();
  const saved = { id: 1109924, nazemItemId: '32698', date, status: 'pending', surah_from: 67, verse_from: 1, surah_to: 114, verse_to: 6 };
  const day = { ...saved, id: 1112906 };
  const item = { id: 32698, type: 'revision', today: day, late_items: [] };
  const mapped = { date, taskType: 'review', remoteType: 'revision', nazemSourceDayId: saved.id, nazemSavedTarget: saved,
    fromSurahId: 67, fromAyah: 1, scheduledToSurahId: 114, scheduledToAyah: 6, toSurahId: 114, toAyah: 6,
    attendanceStatus: 2, completed: false };
  applyRecitationWriteIdentity(mapped, { payload: { submissionTarget: { source: saved } } }, false);
  const adapter = new NazemAdapter();
  const items = [item];
  let posts = 0;
  adapter.readStudentFollowUp = async () => ({ data: { students: [{ student_id: 1, attendance_status: 2, items }] } });
  adapter.postFollowUpApi = async path => { assert.match(path, /1112906\/not-completed$/); posts++; day.status = 'not_completed'; };
  return { adapter, mapped, day, item, items, posts: () => posts, student: { nazemStudentId: '1' }, plan: { nazemPlanId: '2' } };
};

test('same-cycle pending record replacement sends once and verifies the new exact id', async () => {
  const f = fixture();
  const result = await f.adapter.submitRecitation(f.student, f.plan, f.mapped);
  assert.equal(String(result.externalId), '1112906');
  assert.equal(f.posts(), 1);
});

test('replacement rejects changed passage, day, duplicate cycles, final results and blocked prior days', async () => {
  for (const change of [f => { f.day.verse_from = 2; }, f => { f.day.date = '2000-01-01'; },
    f => { f.items.push({ ...f.item }); }, f => { f.day.status = 'completed'; },
    f => { f.item.is_blocked_by_previous_days = true; }, f => { f.mapped.allowPendingTargetReplacement = false; }]) {
    const f = fixture(); change(f);
    await assert.rejects(f.adapter.submitRecitation(f.student, f.plan, f.mapped), { code: 'NAZEM_SAVED_TARGET_CHANGED' });
    assert.equal(f.posts(), 0);
  }
});

test('an unverified previous write restores its exact target and prohibits another replacement', () => {
  const f = fixture();
  applyRecitationWriteIdentity(f.mapped, { payload: { deliveryWrites: [{ path: '/educational-plans/item-days/1112906/not-completed', startedAt: '2026-09-22' }] } }, false);
  assert.equal(f.mapped.nazemSourceDayId, '1112906');
  assert.equal(f.mapped.allowPendingTargetReplacement, false);
  applyRecitationWriteIdentity(f.mapped, { payload: {} }, true);
  assert.equal(f.mapped.allowPendingTargetReplacement, false);
});

test('replacement must be stable across two fresh reads and cannot move again after sending', async () => {
  const unstable = fixture();
  const read = unstable.adapter.readStudentFollowUp;
  let reads = 0;
  unstable.adapter.readStudentFollowUp = async (...args) => {
    if (++reads === 2) unstable.day.id = 1112907;
    return read(...args);
  };
  await assert.rejects(unstable.adapter.submitRecitation(unstable.student, unstable.plan, unstable.mapped), { code: 'NAZEM_SAVED_TARGET_CHANGED' });
  assert.equal(unstable.posts(), 0);
  const moved = fixture();
  let posts = 0;
  moved.adapter.postFollowUpApi = async () => { posts++; moved.day.id = 1112907; };
  await assert.rejects(moved.adapter.submitRecitation(moved.student, moved.plan, moved.mapped), { code: 'NAZEM_DELIVERY_UNVERIFIED' });
  assert.equal(posts, 1);
});

test('same passage in another cycle never replaces a frozen review, and legacy cycle identity is not guessed', async () => {
  for (const change of [f => { delete f.mapped.nazemSavedTarget.nazemItemId; }, f => { f.item.id = 13832; }]) {
    const f = fixture(); change(f);
    await assert.rejects(f.adapter.submitRecitation(f.student, f.plan, f.mapped), { code: 'NAZEM_SAVED_TARGET_CHANGED' });
    assert.equal(f.posts(), 0);
  }
  const f = fixture();
  f.items.unshift({ id: 13832, type: 'revision', status: 'completed', today: { ...f.day, id: 1105747, status: 'completed' } });
  await f.adapter.submitRecitation(f.student, f.plan, f.mapped);
  assert.equal(f.posts(), 1);
});

test('pending memorization and mastery also recover only within the frozen parent cycle', async () => {
  for (const remoteType of ['conserve', 'master']) {
    const f = fixture();
    f.item.type = remoteType;
    f.mapped.remoteType = remoteType;
    f.mapped.taskType = 'memorization';
    const resolved = await f.adapter.resolveRecitationFollowUp(f.student, f.plan, f.mapped);
    assert.equal(resolved.day.id, f.day.id);
    assert.equal(resolved.item.id, 32698);
    f.item.id = 32699;
    await assert.rejects(f.adapter.resolveRecitationFollowUp(f.student, f.plan, f.mapped), { code: 'NAZEM_SAVED_TARGET_CHANGED' });
  }
});

test('regenerated reviews keep the original date and cycle for any student after midnight', async () => {
  for (const studentId of ['1395', '7734', '29189']) {
    const f = fixture();
    f.student.nazemStudentId = studentId;
    const today = getBusinessDate();
    const originalDate = shiftDateOnly(today, -1);
    f.mapped.date = originalDate;
    f.mapped.nazemSavedTarget.date = originalDate;
    f.day.date = originalDate;
    const reads = [];
    f.adapter.readStudentFollowUp = async (_student, _plan, date) => {
      reads.push(date);
      return { data: { students: [{ student_id: Number(studentId), attendance_status: 2,
        items: [{ ...f.item, today: date === today ? { ...f.day, id: 999999, date: today } : f.day }] }] } };
    };
    const result = await f.adapter.submitRecitation(f.student, f.plan, f.mapped);
    assert.equal(result.externalId, String(f.day.id));
    assert.equal(f.posts(), 1);
    assert.deepEqual(reads.slice(0, 3), [today, originalDate, originalDate]);
  }
});

test('review resolution never treats a previous-day pending record as today or as late completion', async () => {
  const f = fixture();
  f.item.pending_day = { ...f.day, id: f.mapped.nazemSourceDayId };
  f.item.is_blocked_by_previous_days = true;
  f.item.late_items = [{ ...f.item.pending_day, source_day_id: f.mapped.nazemSourceDayId }];
  f.item.today = null;
  await assert.rejects(f.adapter.resolveRecitationFollowUp(f.student, f.plan, f.mapped), { code: 'NAZEM_SAVED_TARGET_CHANGED' });
  assert.equal(f.posts(), 0);
});

test('missing legacy cycle reports the missing evidence instead of claiming the plan changed', async () => {
  const f = fixture();
  delete f.mapped.nazemSavedTarget.nazemItemId;
  await assert.rejects(f.adapter.resolveRecitationFollowUp(f.student, f.plan, f.mapped), error => {
    assert.equal(error.details.reason, 'original-cycle-missing');
    assert.match(error.message, /دون رقم دورة المراجعة/);
    return true;
  });
  assert.equal(f.posts(), 0);
});

test('current review cycles survive identity regeneration through authority, submission and replay', async () => {
  const cases = [[10560, 32169, 36], [9533, 32168, 31], [14487, 32143, 73],
    [10735, 32142, 50], [13837, 32141, 73]];
  for (const offset of [0, -1]) {
    for (const [studentId, cycleId, fromSurah] of cases) {
      const f = fixture();
      const today = getBusinessDate();
      const date = shiftDateOnly(today, offset);
      Object.assign(f.mapped, { date, fromSurahId: fromSurah });
      Object.assign(f.mapped.nazemSavedTarget, { date, nazemItemId: String(cycleId), surah_from: fromSurah });
      Object.assign(f.day, { date, nazemItemId: String(cycleId), surah_from: fromSurah });
      f.item.id = cycleId;
      f.student.nazemStudentId = String(studentId);
      f.adapter.readStudentFollowUp = async (_student, _plan, queryDate) => ({ data: { students: [{
        student_id: studentId, attendance_status: 2, items: [{ ...f.item,
          today: queryDate === date ? f.day : { ...f.day, id: 999999, date: queryDate, status: 'pending' } }],
      }] } });
      const task = { adapter: f.adapter, mapped: f.mapped, studentLink: f.student, planLink: f.plan,
        applyAttendance: async value => assert.equal(value.date, today),
        importDay: async day => { assert.equal(day.date, date); return { synced: true }; } };
      const result = await submitWithNazemAuthority(task);
      assert.equal(result.externalId, String(f.day.id));
      assert.equal(f.posts(), 1);
      // The durable send identity is restored when the worker retries the same job.
      applyRecitationWriteIdentity(f.mapped, { payload: { deliveryWrites: [{
        path: `/educational-plans/item-days/${f.day.id}/not-completed`, acceptedAt: '2026-09-23',
      }] } }, false);
      const replay = await submitWithNazemAuthority(task);
      assert.equal(replay.authoritative, true);
      assert.equal(f.posts(), 1);
    }
  }
});
