import test from 'node:test';
import assert from 'node:assert/strict';
import { getBusinessDate } from '../shared/business-date.js';
import { NazemAdapter } from '../server/integrations/nazem/adapter.js';
import { findMatchingNazemLate } from '../server/integrations/nazem/recitationTarget.js';

test('current late records send sequentially by identity without opening unavailable historical dates', async () => {
  for (const remoteType of ['conserve', 'revision', 'master']) {
    const adapter = new NazemAdapter();
    let late = [1, 2].map(index => ({ id: 50 + index, source_day_id: 700 + index, status: 'pending',
      date: `2026-09-0${index}`, surah_from: 2, verse_from: index === 1 ? 1 : 11, surah_to: 2, verse_to: index * 10 }));
    const writes = [];
    adapter.openFollowUp = async (_plan, date) => {
      assert.equal(date, getBusinessDate(), 'must consult the current Nazem queue first');
      return { data: { students: [{ student_id: 91, attendance_status: 2,
        items: { data: [{ type: remoteType, late_items: late, today: { id: 800, status: 'pending' } }] } }] } };
    };
    adapter.postFollowUpApi = async path => {
      writes.push(path);
      const id = Number(path.match(/item-late\/(\d+)\/complete/)?.[1]);
      if (id) late = late.filter(item => item.id !== id);
    };
    for (const index of [1, 2]) {
      const mapped = { taskType: remoteType === 'revision' ? 'review' : 'memorization', remoteType,
        date: `2026-09-0${index}`, sessionDate: '2026-09-03', completed: true, attendanceStatus: 2,
        nazemSourceDayId: 700 + index, fromSurahId: 2, fromAyah: index === 1 ? 1 : 11,
        scheduledToSurahId: 2, scheduledToAyah: index * 10 };
      assert.equal((await adapter.readRecitationAuthority({ nazemStudentId: 91 }, { nazemPlanId: 8 }, mapped)).final, false);
      const result = await adapter.submitRecitation({ nazemStudentId: 91 }, { nazemPlanId: 8 }, mapped);
      assert.equal(result.lateCompleted, true);
    }
    assert.deepEqual(writes.filter(path => path.includes('item-late')), ['/educational-plans/item-late/51/complete', '/educational-plans/item-late/52/complete']);
    assert.equal(late.length, 0);
  }
});

test('repeated equal ranges must match their record identity instead of another day', () => {
  const range = { surah_from: 2, verse_from: 1, surah_to: 2, verse_to: 10 };
  const items = [{ ...range, id: 1, source_day_id: 101 }, { ...range, id: 2, source_day_id: 102 }];
  const mapped = { fromSurahId: 2, fromAyah: 1, scheduledToSurahId: 2, scheduledToAyah: 10, date: '2026-09-01' };
  assert.equal(findMatchingNazemLate(items, { ...mapped, nazemSourceDayId: 102 }).id, 2);
  assert.equal(findMatchingNazemLate(items, { ...mapped, nazemSourceDayId: 999 }), null);
  assert.equal(findMatchingNazemLate(items, { ...mapped, nazemLateId: 2, nazemSourceDayId: 101 }).id, 2);
  assert.equal(findMatchingNazemLate(items, { ...mapped, nazemLateId: 999, nazemSourceDayId: 101 }), null);
  assert.throws(() => findMatchingNazemLate(items, mapped), { code: 'NAZEM_LATE_IDENTITY_AMBIGUOUS' });
});

test('completed memorization does not silently finalize a still-unsent link count', async () => {
  const adapter = new NazemAdapter();
  adapter.openFollowUp = async () => ({ students: [{ student_id: 91, attendance_status: 2,
    items: [{ type: 'conserve', today: { id: 20, status: 'completed', link: 0 } }] }] });
  const state = await adapter.readRecitationAuthority({ nazemStudentId: 91 }, { nazemPlanId: 8 },
    { taskType: 'link', remoteType: 'conserve', date: getBusinessDate(), linkCount: 3 });
  assert.equal(state.final, false);
});
