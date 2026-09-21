import { getBusinessDate } from '../shared/business-date.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { NazemAdapter } from '../server/integrations/nazem/adapter.js';
import { submitWithNazemAuthority } from '../server/integrations/nazem/recitationAuthority.js';

function fixture(status = 'completed', attendance = 2) {
  const adapter = new NazemAdapter();
  const studentLink = { nazemStudentId: '91', nazemStudentName: 'طالب الاختبار' };
  const planLink = { nazemPlanId: '8' };
  const day = { id: 31, status, surah_from: 2, verse_from: 1, surah_to: 2, verse_to: 10, actual_surah_to: 2, actual_verse_to: 5, mistake: 4, hearing: 2, repetition: 0, link: 0 };
  adapter.openFollowUp = async (id, date, options) => {
    assert.equal(id, '8'); assert.ok([getBusinessDate(), '2026-09-06'].includes(date));
    assert.equal(options?.fresh, true);
    return { data: { students: [{ student_id: 91, attendance_status: attendance, items: [{ type: 'conserve', today: day }] }] } };
  };
  const imported = []; const attendances = []; const sent = [];
  adapter.submitRecitation = async (_student, _plan, mapped) => { sent.push({ ...mapped }); return { externalId: 'new' }; };
  return { adapter, studentLink, planLink, mapped: { nazemSourceDayId: 31, fromSurahId: 2, fromAyah: 1, scheduledToSurahId: 2, scheduledToAyah: 10, toSurahId: 2, toAyah: 5, remoteMistakeCount: 4, date: '2026-09-06', taskType: 'memorization', remoteType: 'conserve', completed: false, attendanceStatus: null },
    importDay: async (value) => { imported.push(value); return { synced: 1 }; },
    applyAttendance: async (value) => attendances.push(value), imported, attendances, sent, day };
}

test('current late completion overrides historical failure and uses current attendance', async () => {
  const task = fixture('not_completed', 3);
  Object.assign(task.mapped, { nazemLateId: 31, sessionDate: '2026-09-07', completed: true, fromSurahId: 2, fromAyah: 1, scheduledToSurahId: 2, scheduledToAyah: 10 });
  task.adapter.openFollowUp = async (_id, date) => ({ data: { students: [{ student_id: 91,
    attendance_status: date === getBusinessDate() ? 2 : 3,
    items: [{ type: 'conserve', today: task.day, late_items: date === getBusinessDate() ? [{ ...task.day, date: '2026-09-06' }] : [] }],
  }] } });
  await submitWithNazemAuthority(task);
  assert.equal(task.sent.length, 1);
  assert.equal(task.sent[0].attendanceStatus, 2);
  assert.deepEqual(task.attendances, [{ date: getBusinessDate(), attendanceStatus: 2 }]);
  assert.deepEqual(task.imported, []);
});

test('conflicting remote outcomes never replace a saved local evaluation', async () => {
  for (const status of ['completed', 'not_completed', 'partial', 'completed_early', 'partial_early', 'completed_late']) {
    const task = fixture(status);
    task.mapped.completed = status === 'not_completed';
    await assert.rejects(submitWithNazemAuthority(task), { code: 'NAZEM_RECITATION_RESULT_CONFLICT' });
    assert.deepEqual(task.imported, []);
    assert.deepEqual(task.sent, []);
  }
});

test('a matching final outcome is reconciled without resending or replacing its metrics', async () => {
  const task = fixture();
  task.mapped.completed = true;
  assert.equal((await submitWithNazemAuthority(task)).authoritative, true);
  assert.equal(task.imported[0].mistake, 4);
  assert.deepEqual(task.sent, []);
});

test('remote attendance fills missing local attendance before sending a pending day', async () => {
  const task = fixture('pending', 5);
  await submitWithNazemAuthority(task);
  assert.equal(task.sent[0].attendanceStatus, 5);
  assert.deepEqual(task.attendances, [{ date: getBusinessDate(), attendanceStatus: 5 }]);
  assert.deepEqual(task.imported, []);
});

test('remote absence prevents sending even when local attendance says present', async () => {
  const task = fixture('pending', 3);
  task.mapped.attendanceStatus = 2;
  await assert.rejects(submitWithNazemAuthority(task), { code: 'NAZEM_ATTENDANCE_BLOCKS_RECITATION' });
  assert.deepEqual(task.sent, []);
});

test('missing attendance on both sides and failed remote reads never submit fallback data', async () => {
  const task = fixture('pending', null);
  await assert.rejects(submitWithNazemAuthority(task), { code: 'RUWASI_ATTENDANCE_MISSING' });
  task.mapped.attendanceStatus = 2;
  task.adapter.openFollowUp = async () => { throw new Error('read failed'); };
  await assert.rejects(submitWithNazemAuthority(task), /read failed/);
  assert.deepEqual(task.sent, []);
});

test('identity and local import failures do not overwrite the remote record', async () => {
  const task = fixture();
  task.mapped.completed = true;
  task.importDay = async () => ({ synced: 0, review: 1 });
  await assert.rejects(submitWithNazemAuthority(task), { code: 'NAZEM_REMOTE_DAILY_RANGE_UNMATCHED' });
  task.studentLink.nazemStudentId = '92';
  task.adapter.getPlanGroupDetails = async () => ({ students: [{ student_id: 91, student_name: 'طالب الاختبار' }] });
  await assert.rejects(submitWithNazemAuthority(task), { code: 'NAZEM_PLAN_STUDENT_MISMATCH' });
  assert.deepEqual(task.sent, []);
});

test('a remote result finalized during submission is imported after one fresh read', async () => {
  const task = fixture('pending');
  task.adapter.submitRecitation = async () => {
    task.day.status = 'not_completed';
    throw Object.assign(new Error('changed'), { syncStatus: 'conflict' });
  };
  assert.equal((await submitWithNazemAuthority(task)).authoritative, true);
  assert.equal(task.imported[0].status, 'not_completed');
});

test('attendance submission preserves an existing remote attendance', async () => {
  const adapter = new NazemAdapter();
  adapter.openFollowUp = async () => ({ data: { students: [{ student_id: 91, attendance_status: 3 }] } });
  adapter.postFollowUpApi = async () => { throw new Error('Must not overwrite Nazem attendance'); };
  const result = await adapter.submitAttendance({ nazemStudentId: '91' }, { nazemPlanId: '8' }, { date: '2026-09-06', attendanceStatus: 2 });
  assert.deepEqual(result, { attendanceStatus: 3, authoritative: true });
});

test('explicit teacher attendance change updates Nazem instead of restoring previous presence', async () => {
  const adapter = new NazemAdapter();
  let status = 2; let writes = 0;
  adapter.openFollowUp = async () => ({ data: { students: [{ student_id: 91, attendance_status: status }] } });
  adapter.postFollowUpApi = async (_path, body) => { status = body.attendance_status; writes++; };
  const result = await adapter.submitAttendance({ nazemStudentId: '91' }, { nazemPlanId: '8' },
    { date: '2026-09-07', attendanceStatus: 3, explicitChange: true });
  assert.equal(result.attendanceStatus, 3); assert.equal(writes, 1);
});
