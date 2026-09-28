import test from 'node:test';
import assert from 'node:assert/strict';
import { NazemAdapter } from '../server/integrations/nazem/adapter.js';
import { requireRecordedNazemLink, wakeNazemMemorizationAfterLink } from '../server/integrations/nazem/pairedRecitation.js';
import { submitWithNazemAuthority } from '../server/integrations/nazem/recitationAuthority.js';
import { getBusinessDate } from '../shared/business-date.js';

for (const first of ['memorization', 'link']) for (const count of [0, 7]) {
  test(`${first} first, link count ${count}: both results wait then need only one remote write`, async () => {
    const date = getBusinessDate();
    const day = { id: 101, date, status: 'pending', remoteType: 'conserve', surah_from: 1, verse_from: 1,
      surah_to: 1, verse_to: 7, mistake: 0, hearing: 2, repetition: 0, link: 0 };
    const mapped = { date, taskType: 'memorization', remoteType: 'conserve', nazemSourceDayId: 101,
      nazemSavedTarget: { ...day }, fromSurahId: 1, fromAyah: 1, scheduledToSurahId: 1,
      scheduledToAyah: 7, toSurahId: 1, toAyah: 7, completed: true, attendanceStatus: 2 };
    const adapter = new NazemAdapter();
    adapter.readStudentFollowUp = async () => ({ data: { students: [{ student_id: 1, attendance_status: 2,
      items: [{ type: 'conserve', today: day, late_items: [] }] }] } });
    const posts = [];
    adapter.postFollowUpApi = async (path, body) => {
      posts.push({ path, body });
      Object.assign(day, { status: 'completed', actual_surah_to: 1, actual_verse_to: 7,
        link: body.link, mistake: body.mistake, hearing: body.hearing, repetition: body.repetition });
    };
    let links = [{ id: 9, evaluated: 0, linkCount: null }, { id: 10, evaluated: 0, linkCount: null }];
    const connection = { query: async () => [links] };
    const studentLink = { nazemStudentId: '1' }, planLink = { nazemPlanId: '2' };
    const job = { payload: {} };
    const sendMemorization = () => submitWithNazemAuthority({ adapter, studentLink, planLink, mapped,
      applyAttendance: async () => {}, importDay: async () => ({ synced: true }),
      beforeSubmit: () => requireRecordedNazemLink(connection, { planId: 2, studentId: 3, taskDate: date }, mapped, job) });
    const sendLink = () => adapter.submitRecitation(studentLink, planLink,
      { ...mapped, taskType: 'link', linkCount: count });
    if (first === 'link') await assert.rejects(sendLink(), { code: 'NAZEM_LINK_WAITING_FOR_MEMORIZATION' });
    else await assert.rejects(sendMemorization(), { code: 'NAZEM_MEMORIZATION_WAITING_FOR_LINK' });
    assert.equal(posts.length, 0);
    links[0] = { id: 9, evaluated: 1, linkCount: count };
    await assert.rejects(sendMemorization(), { code: 'NAZEM_MEMORIZATION_WAITING_FOR_LINK' });
    links[1] = { id: 10, evaluated: 1, linkCount: 0 };
    await sendMemorization();
    assert.equal(posts.length, 1);
    assert.equal(posts[0].body.link, count);
    assert.equal((await sendLink()).alreadyRecorded, true);
    await sendMemorization();
    assert.equal(posts.length, 1);
  });
}

test('review, mastery, lates and possibly delivered writes never acquire a new link dependency', async () => {
  const connection = { query: async () => assert.fail('no dependency query expected') };
  for (const mapped of [{ taskType: 'review' }, { taskType: 'memorization', remoteType: 'master' },
    { taskType: 'memorization', remoteType: 'conserve', nazemLateId: 4 }]) {
    await requireRecordedNazemLink(connection, {}, mapped, { payload: {} });
  }
  await requireRecordedNazemLink(connection, {}, { taskType: 'memorization', remoteType: 'conserve' },
    { payload: { deliveryWrites: [{ startedAt: '2026-09-29' }] } });
});

test('waking a waiting memorization is scoped to the same teacher, student, plan and date', async () => {
  await wakeNazemMemorizationAfterLink({ query: async (sql, params) => {
    assert.match(sql, /NOT EXISTS[\s\S]*actual_link_count IS NULL/);
    assert.match(sql, /a.is_official = 1/);
    assert.deepEqual(params, [3, 4, '5', '2026-09-29', 5, '2026-09-29', 5, '2026-09-29']);
  } }, { studentId: 4, planId: 5, taskDate: '2026-09-29' }, 3);
});
