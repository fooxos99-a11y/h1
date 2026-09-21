import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { recitationSessionTypeForTask } from '../shared/offline-recitation.js';
import { hasNazemFixedRange, resolveTaskRecitationMode } from '../shared/nazem-recitation-policy.js';
import { mergeCommittedOfflineEvaluation } from '../src/lib/offlineEvaluationMerge.js';
import { recitationErrorMessage } from '../src/lib/recitationErrorMessage.js';
import { calculateRecitationScore } from '../shared/evaluation-settings.js';
import { mapRuwasiRecitationToNazem, mapRuwasiRecitationGroupToNazem } from '../server/integrations/nazem/mapping.js';
import { NazemAdapter } from '../server/integrations/nazem/adapter.js';
import { submitWithNazemAuthority } from '../server/integrations/nazem/recitationAuthority.js';
import { buildNazemLateTaskExistsSql } from '../server/integrations/nazem/lateTaskScope.js';
import { getBusinessDate } from '../shared/business-date.js';

const base = { id: 1, studentId: 9, planId: 10, planVersion: 2, taskDate: '2026-09-07', taskType: 'memorization', track: 'memorization', nazemManaged: true };
const evaluation = () => ({ date: getBusinessDate(), attendanceSnapshotAt: 100, tasks: [base], taskQueue: [base],
  students: [{ studentId: 9, attendanceStatus: 'present', nazemManaged: true }] });

test('memorization and mastery remain independent for both ordinary and dated Nazem sessions', () => {
  for (const nazemManaged of [true, false]) {
    const saved = { ...base, nazemManaged };
    assert.notEqual(recitationSessionTypeForTask(saved), recitationSessionTypeForTask({ ...saved, track: 'mastery' }));
    assert.match(recitationSessionTypeForTask({ ...saved, taskType: 'review', track: 'mastery' }), /^review/);
  }
});

test('lost server reply retains the exact saved task while allowing a different next task', () => {
  const session = { sessionId: 'saved', studentId: 9, sessionDate: getBusinessDate(), status: 'failed',
    tasks: [{ ...base, taskId: base.id, synced: false, payload: { offlineOutcome: { completed: true } } }] };
  const state = mergeCommittedOfflineEvaluation(evaluation(), [session]);
  assert.equal(state.tasks.length, 0);
  assert.equal(state.students[0].recitationPending, true);
  assert.equal(state.deliveryReceipts[0].status, 'local_failed');
  const next = { ...base, id: 2, taskDate: '2026-09-08' };
  assert.deepEqual(mergeCommittedOfflineEvaluation({ ...evaluation(), tasks: [next], taskQueue: [next] }, [session]).tasks, [next]);
});

test('manual absence cannot be undone by a response captured before its server receipt', () => {
  const action = { actionType: 'student_attendance', status: 'synced', result: { serverRecordedAt: 200 },
    payload: { studentId: 9, date: getBusinessDate(), status: 'absent' } };
  const absent = mergeCommittedOfflineEvaluation(evaluation(), [], [action]);
  assert.equal(absent.students.length, 0);
  assert.equal(absent.tasks.length, 0);
  assert.equal(absent.taskQueue.length, 0);
  const fresh = { ...evaluation(), attendanceSnapshotAt: 300 };
  assert.equal(mergeCommittedOfflineEvaluation(fresh, [], [action]).students[0].attendanceStatus, 'present');
});

test('ordinary review permits choosing an endpoint; linking and actual late completion keep their fixed contracts', () => {
  assert.equal(hasNazemFixedRange({ ...base, taskType: 'review' }), false);
  assert.equal(hasNazemFixedRange({ ...base, nazemLate: true }), true);
  assert.equal(hasNazemFixedRange({ ...base, taskType: 'link' }), true);
  assert.equal(resolveTaskRecitationMode({ ...base, track: 'mastery' }, 'mushaf'), 'count');
  assert.match(buildNazemLateTaskExistsSql('t'), /nazemPendingDay/);
  assert.doesNotMatch(buildNazemLateTaskExistsSql('t', { includePending: false }), /nazemPendingDay/);
});

function historicalLink(todayAttendance, oldAttendance, link = 1) {
  const adapter = new NazemAdapter();
  const today = getBusinessDate();
  adapter.openFollowUp = async (_plan, date) => ({ data: { students: [{ student_id: 91,
    attendance_status: date === today ? todayAttendance : oldAttendance,
    items: [{ type: 'conserve', today: { id: date === today ? 101 : 100, status: 'completed', link } }],
  }] } });
  const sent = [], applied = [];
  adapter.submitRecitation = async (_s, _p, mapped) => { sent.push({ ...mapped }); return { ok: true }; };
  return { adapter, studentLink: { nazemStudentId: '91' }, planLink: { nazemPlanId: '8' },
    mapped: { taskType: 'link', remoteType: 'conserve', nazemSourceDayId: 100, date: '2026-09-03', linkCount: 5 },
    applyAttendance: async (value) => applied.push(value), importDay: async () => { throw new Error('Link is not memorization'); }, sent, applied };
}

test('old amount uses current execution attendance and leaves historical absence unchanged', async () => {
  const task = historicalLink(2, 3);
  await submitWithNazemAuthority(task);
  assert.equal(task.sent[0].attendanceStatus, 2);
  assert.deepEqual(task.applied, [{ date: getBusinessDate(), attendanceStatus: 2 }]);
  assert.equal(task.sent[0].date, '2026-09-03');
});

test('current absence blocks new recitation even if the original day was present', async () => {
  const task = historicalLink(3, 2);
  await assert.rejects(submitWithNazemAuthority(task), { code: 'NAZEM_ATTENDANCE_BLOCKS_RECITATION' });
  assert.equal(task.sent.length, 0);
});

test('a link already recorded in Nazem is acknowledged without sending it again', async () => {
  const task = historicalLink(3, 3, 5);
  const result = await submitWithNazemAuthority(task);
  assert.equal(result.alreadyRecorded, true);
  assert.equal(task.sent.length, 0);
});

test('a planned link count in a pending memorization day is not a delivery receipt', async () => {
  const adapter = new NazemAdapter();
  adapter.openFollowUp = async () => ({ data: { students: [{ student_id: 91, attendance_status: 2,
    items: [{ type: 'conserve', today: { id: 8, status: 'pending', link: 5 } }] }] } });
  const student = { nazemStudentId: '91' }, plan = { nazemPlanId: '8' };
  const mapped = { taskType: 'link', remoteType: 'conserve', date: getBusinessDate(), nazemSourceDayId: 8, linkCount: 5 };
  assert.equal((await adapter.readRecitationAuthority(student, plan, mapped)).linkAlreadyRecorded, false);
  await assert.rejects(adapter.submitLink(student, plan, mapped), { code: 'NAZEM_LINK_WAITING_FOR_MEMORIZATION' });
});

test('linking an old completed amount uses current attendance and preserves its memorization metrics', async () => {
  const adapter = new NazemAdapter();
  const day = { id: 8, status: 'completed', link: 1, mistake: 2, hearing: 1, repetition: 3, actual_surah_to: 2, actual_verse_to: 5 };
  adapter.openFollowUp = async (_plan, date) => ({ data: { students: [{ student_id: 91,
    attendance_status: date === getBusinessDate() ? 2 : 3,
    items: [{ type: 'conserve', today: date === getBusinessDate() ? { ...day, id: 9 } : day }] }] } });
  const writes = [];
  adapter.postFollowUpApi = async (path, payload) => { writes.push({ path, payload }); day.link = payload.link; };
  await adapter.submitLink({ nazemStudentId: '91' }, { nazemPlanId: '8' },
    { taskType: 'link', remoteType: 'conserve', date: '2026-09-03', nazemSourceDayId: 8, linkCount: 5 });
  assert.deepEqual(writes, [{ path: '/educational-plans/item-days/8/partial', payload: {
    actual_end_surah: 2, actual_end_aya: 5, mistake: 2, hearing: 1, repetition: 3, attendance_status: 2, link: 5,
  } }]);
});

test('late completion posts attendance only for the current execution day', async () => {
  const adapter = new NazemAdapter();
  const posts = [];
  adapter.resolveRecitationFollowUp = async () => ({ item: {}, late: { id: 72 }, followUpDate: getBusinessDate() });
  adapter.postFollowUpApi = async (path, payload) => posts.push({ path, payload });
  adapter.openFollowUp = async (_plan, date) => {
    assert.equal(date, getBusinessDate());
    return { data: { students: [{ student_id: 91, attendance_status: 2,
      items: [{ type: 'conserve', late_items: [] }] }] } };
  };
  const result = await adapter.submitRecitation({ nazemStudentId: '91' }, { nazemPlanId: '8' },
    { taskType: 'memorization', remoteType: 'conserve', date: '2026-09-03', completed: true, attendanceStatus: 2 });
  assert.equal(result.lateCompleted, true);
  assert.deepEqual(posts, [{ path: '/educational-plans/item-late/72/complete', payload: undefined },
    { path: '/educational-plans/8/attendance', payload: { student_id: 91, attendance_status: 2, date: getBusinessDate() } }]);
});

test('the identified pending day can be submitted while today is blocked, then verified after the queue advances', async () => {
  const adapter = new NazemAdapter();
  const sourceDate = '2026-09-03';
  const day = { id: 72, date: sourceDate, status: 'pending', surah_from: 2, verse_from: 1, surah_to: 2, verse_to: 5 };
  let saved = false;
  const writes = [], attendance = [];
  adapter.openFollowUp = async (_plan, date) => ({ data: { students: [{ student_id: 91,
    attendance_status: date === getBusinessDate() ? 2 : 3,
    items: [{ type: 'master', is_blocked_by_previous_days: date === getBusinessDate(),
      pending_day: date === getBusinessDate() ? (saved ? { ...day, id: 73, date: '2026-09-04' } : day) : null,
      today: date === getBusinessDate() ? { ...day, id: 80, date: getBusinessDate() } : day }],
  }] } });
  adapter.postFollowUpApi = async (path, payload) => {
    writes.push({ path, payload });
    Object.assign(day, { status: 'completed', actual_surah_to: 2, actual_verse_to: 5 });
    saved = true;
  };
  const mapped = { taskType: 'memorization', remoteType: 'master', completed: true, attendanceStatus: 2,
    date: sourceDate, nazemSourceDayId: 72, fromSurahId: 2, fromAyah: 1, scheduledToSurahId: 2, scheduledToAyah: 5, toSurahId: 2, toAyah: 5 };
  const result = await submitWithNazemAuthority({ adapter, mapped, studentLink: { nazemStudentId: '91' }, planLink: { nazemPlanId: '8' },
    applyAttendance: async value => attendance.push(value), importDay: async () => { throw new Error('Unsubmitted pending day cannot be adopted'); } });
  assert.equal(result.externalId, '72');
  assert.equal(result.attendanceStatus, 2);
  assert.deepEqual(writes, [{ path: '/educational-plans/item-days/72/partial', payload: { actual_end_surah: 2, actual_end_aya: 5, attendance_status: 2 } }]);
  assert.deepEqual(attendance, [{ date: getBusinessDate(), attendanceStatus: 2 }]);
});

test('Nazem mastery sends binary completion without memorization mistake, repeat or link metrics', async () => {
  for (const completed of [true, false]) {
    const adapter = new NazemAdapter();
    const mapped = { taskType: 'memorization', remoteType: 'master', completed, attendanceStatus: 2,
      fromSurahId: 2, fromAyah: 1, scheduledToSurahId: 2, scheduledToAyah: 5, toSurahId: 2, toAyah: 5 };
    adapter.resolveRecitationFollowUp = async () => ({ item: {}, day: { id: 8, surah_from: 2, verse_from: 1, surah_to: 2, verse_to: 5 },
      payload: {}, followUpDate: getBusinessDate() });
    let saved = false;
    adapter.verifyRecitation = async () => saved ? { status: completed ? 'completed' : 'not_completed' } : false;
    adapter.openFollowUp = async () => ({});
    adapter.postFollowUpApi = async (path, payload) => {
      assert.equal(path, `/educational-plans/item-days/8/${completed ? 'partial' : 'not-completed'}`);
      assert.deepEqual(payload, completed ? { actual_end_surah: 2, actual_end_aya: 5, attendance_status: 2 } : { attendance_status: 2 });
      saved = true;
    };
    await adapter.submitRecitation({}, {}, mapped);
    assert.equal(saved, true);
  }
});

test('service worker leaves API requests to the browser and technical network errors are translated', () => {
  const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  const listeners = {};
  vm.runInNewContext(source, { URL, self: { location: new URL('https://test.local/sw.js'), registration: { scope: 'https://test.local/' },
    addEventListener: (name, handler) => { listeners[name] = handler; } } });
  let intercepted = false;
  listeners.fetch({ request: { url: 'https://test.local/api/recitations', method: 'POST' }, respondWith: () => { intercepted = true; } });
  assert.equal(intercepted, false);
  assert.doesNotMatch(recitationErrorMessage(new Error('FetchEvent.respondWith received an error: TypeError: Load failed')), /FetchEvent|TypeError/);
});


test('mastery errors reduce the local grade without changing Nazem completion or overwriting local metrics on import', () => {
  const score = calculateRecitationScore({ type: 'mastery', unit: 'quarterFace', maxScore: 20, mistakeDeduction: 3, warningDeduction: 1 }, 0.25, 1, 2);
  assert.equal(score, 13);
  const row = { id: 1, taskId: 1, taskType: 'memorization', track: 'mastery', teacherCompleted: true,
    taskDate: '2026-09-07', warningCount: 1, mistakeCount: 2, evaluationScore: score,
    fromPage: 2, toPage: 2, fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 5 };
  for (const local of [mapRuwasiRecitationToNazem(row), mapRuwasiRecitationGroupToNazem([row])]) {
    assert.equal(local.score, 13);
    assert.equal(local.mistakeCount, 2);
    assert.equal(local.remoteMistakeCount, 0);
    assert.equal(local.completed, true);
    const source = readFileSync(new URL('../server/integrations/nazem/service.js', import.meta.url), 'utf8');
    const start = source.indexOf('const remoteFollowUpMatchesLocal =');
    const end = source.indexOf('\n};', start) + 3;
    const matches = vm.runInNewContext(source.slice(start, end) + '\nremoteFollowUpMatchesLocal', {
      remoteFollowUpCompleted: day => day.status === 'completed',
      nazemRemoteErrorCount: day => Number(day.mistake || 0), nazemFollowUpMetricsMatch: () => true,
    });
    const day = { date: row.taskDate, status: 'completed', surah_from: 2, verse_from: 1, surah_to: 2, verse_to: 5,
      actual_surah_to: 2, actual_verse_to: 5, mistake: 0, tune: 0 };
    assert.equal(matches(day, local), true, 'Binary Nazem receipt preserves local mastery errors');
    assert.equal(matches(day, { ...local, remoteType: 'conserve' }), false, 'Memorization errors still require equality');
  }
});
