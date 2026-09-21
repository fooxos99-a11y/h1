import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NazemAdapter } from '../server/integrations/nazem/adapter.js';
import { recitationIdentityFromReceipt } from '../server/integrations/nazem/followUpCycles.js';
import { getBusinessDate } from '../shared/business-date.js';
import { matchesNazemTarget } from '../server/integrations/nazem/recitationTarget.js';
import { captureRecitationTarget, hasLocalRecitation, recitationWriteJournal, validateRecitationTarget } from '../server/integrations/nazem/recitationSubmission.js';
import { failNazemJob } from '../server/integrations/nazem/queue.js';
import { reviewNazemError } from '../server/integrations/nazem/errors.js';

function fixture() {
  const date = getBusinessDate();
  const day = { id: 101, date, remoteType: 'conserve', status: 'pending',
    surah_from: 1, verse_from: 1, surah_to: 1, verse_to: 7, mistake: 0, hearing: 2, repetition: 0, link: 0 };
  const mapped = { date, taskType: 'memorization', remoteType: 'conserve', nazemSourceDayId: 101,
    nazemSavedTarget: { ...day }, fromSurahId: 1, fromAyah: 1, scheduledToSurahId: 1, scheduledToAyah: 7,
    toSurahId: 1, toAyah: 7, completed: true, attendanceStatus: 2 };
  const adapter = new NazemAdapter();
  const calls = { reads: 0, posts: 0 };
  adapter.readStudentFollowUp = async () => {
    calls.reads++;
    return { data: { students: [{ student_id: 1, attendance_status: 2, items: [{ type: 'conserve', today: day, late_items: [] }] }] } };
  };
  adapter.postFollowUpApi = async () => { calls.posts++; return { success: true }; };
  const student = { nazemStudentId: '1' }, plan = { nazemPlanId: '2' };
  return { day, mapped, adapter, calls, student, plan };
}

test('accepted POST with a still-pending remote target is never declared completed, including with a saved snapshot', async () => {
  const f = fixture();
  await assert.rejects(f.adapter.submitRecitation(f.student, f.plan, f.mapped), { code: 'NAZEM_DELIVERY_UNVERIFIED' });
  assert.deepEqual(f.calls, { reads: 2, posts: 1 });
});

test('target advancement after POST is classified as uncertain delivery, not as a pre-send identity rejection', async () => {
  const f = fixture();
  f.adapter.postFollowUpApi = async () => { f.calls.posts++; f.day.id = 102; };
  await assert.rejects(f.adapter.submitRecitation(f.student, f.plan, f.mapped), error => {
    assert.equal(error.code, 'NAZEM_DELIVERY_UNVERIFIED');
    assert.equal(error.details.stage, 'post-write-verification');
    return true;
  });
  assert.equal(f.calls.posts, 1);
});

test('a durable send marker survives restart and blocks duplicate writes, then permits reconciliation of the exact result', async () => {
  const f = fixture();
  let stored = [];
  const connection = { query: async (_sql, values) => { stored = JSON.parse(values[0]); return [{ affectedRows: 1 }]; } };
  const job = { id: 3, leaseOwner: 'test', payload: {} };
  f.adapter.recitationJournal = recitationWriteJournal(connection, job);
  await assert.rejects(f.adapter.submitRecitation(f.student, f.plan, f.mapped), { code: 'NAZEM_DELIVERY_UNVERIFIED' });
  assert.ok(stored[0].startedAt);
  assert.ok(stored[0].acceptedAt);
  f.adapter.recitationJournal = recitationWriteJournal(connection, { ...job, payload: { deliveryWrites: structuredClone(stored) } });
  await assert.rejects(f.adapter.submitRecitation(f.student, f.plan, f.mapped), { code: 'NAZEM_DELIVERY_UNVERIFIED' });
  assert.equal(f.calls.posts, 1);
  Object.assign(f.day, { status: 'completed', actual_surah_to: 1, actual_verse_to: 7 });
  const result = await f.adapter.submitRecitation(f.student, f.plan, f.mapped);
  assert.equal(result.alreadyRecorded, true);
  assert.equal(f.calls.posts, 1);
});

test('a lost lease prevents a remote write and a lost transport leaves a durable started marker', async () => {
  const f = fixture();
  f.adapter.recitationJournal = recitationWriteJournal({ query: async () => [{ affectedRows: 0 }] }, { id: 3, payload: {} });
  await assert.rejects(f.adapter.submitRecitation(f.student, f.plan, f.mapped), { code: 'NAZEM_SUBMISSION_LEASE_LOST' });
  assert.equal(f.calls.posts, 0);
  const job = { id: 3, payload: {} };
  f.adapter.recitationJournal = recitationWriteJournal({ query: async () => [{ affectedRows: 1 }] }, job);
  f.adapter.postFollowUpApi = async () => { throw new Error('timeout'); };
  await assert.rejects(f.adapter.submitRecitation(f.student, f.plan, f.mapped), { code: 'NAZEM_RECITATION_TIMEOUT' });
  assert.ok(job.payload.deliveryWrites[0].startedAt);
  assert.equal(job.payload.deliveryWrites[0].acceptedAt, undefined);
});

test('equal passages never bypass explicit source identity or an explicit different date', () => {
  const { day, mapped } = fixture();
  assert.equal(matchesNazemTarget({ ...day, id: 999 }, mapped, mapped.date), false);
  assert.equal(matchesNazemTarget({ ...day, date: '2026-08-01' }, mapped, mapped.date), false);
  assert.equal(matchesNazemTarget(day, mapped, mapped.date), true);
});

test('captured targets are independent of future imported snapshots and reject relinking or newer attempts', async () => {
  const { day, student, plan } = fixture();
  const row = { source: JSON.stringify(day), studentExternalId: '1', planExternalId: '2' };
  const target = await captureRecitationTarget({ query: async () => [[row]] }, 5, '11-12');
  row.source = JSON.stringify({ ...day, id: 999 });
  assert.equal(validateRecitationTarget(target, [{ id: 12 }, { id: 11 }], student, plan).id, 101);
  for (const [attempts, remoteStudent, remotePlan] of [
    [[{ id: 13 }], student, plan], [[{ id: 11 }, { id: 12 }], { nazemStudentId: '99' }, plan],
    [[{ id: 11 }, { id: 12 }], student, { nazemPlanId: '99' }],
  ]) assert.throws(() => validateRecitationTarget(target, attempts, remoteStudent, remotePlan), { code: 'NAZEM_SUBMISSION_IDENTITY_CHANGED' });
});

test('a conflicting imported outcome cannot delete teacher marks, replace attempts or dismiss their delivery', async () => {
  const source = readFileSync(new URL('../server/integrations/nazem/service.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function saveRemoteFollowUp(');
  const end = source.indexOf('\nconst NAZEM_ATTENDANCE_TO_RUWASI', start);
  assert.ok(end > start);
  const run = new Function('nazemTaskTrack', 'safeJson', 'loadDailyFollowUp', 'mapRuwasiRecitationGroupToNazem',
    'remoteFollowUpMatchesLocal', 'hasLocalRecitation', 'recitationIdentityFromReceipt', `${source.slice(start, end)}; return saveRemoteFollowUp;`)(
    () => 'memorization', value => value, async () => ({ recitations: [{ id: 7, requestId: 'teacher-local:7' }] }),
    () => ({ completed: true }), () => false, hasLocalRecitation, recitationIdentityFromReceipt,
  );
  const writes = [];
  const connection = { query: async (sql, values) => {
    writes.push({ sql, values });
    if (sql.includes('INSERT INTO nazem_daily')) return [{ insertId: 5 }];
    if (sql.includes('SELECT id, sync_status')) return [[{ id: 5, hasPendingRecitation: 1 }]];
    return [{ affectedRows: 1 }];
  } };
  const result = await run(connection, { planId: 1, studentId: 1, teacherId: 1 }, { id: 101, date: '2026-09-14', taskType: 'memorization', status: 'not_completed' });
  assert.equal(result.conflicts, 1);
  assert.equal(writes.some(({ sql }) => /DELETE|UPDATE student_quran|UPDATE nazem_sync_jobs/.test(sql)), false);
});

test('unverified per-student results never trip the shared adapter circuit', async () => {
  for (const code of ['NAZEM_SUCCESS_UNVERIFIED', 'NAZEM_DELIVERY_UNVERIFIED']) {
    const sql = [];
    await failNazemJob({ query: async statement => { sql.push(statement); return [{ affectedRows: 1 }]; } },
      { id: 1, attemptCount: 1, maxAttempts: 2 }, reviewNazemError('verification pending', code));
    assert.equal(sql.some(statement => statement.includes('nazem_circuit_breakers')), false);
  }
});

test('matched imports confirm only the current official attempts and preserve their results', async () => {
  const source = readFileSync(new URL('../server/integrations/nazem/service.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function saveRemoteFollowUp(');
  const end = source.indexOf('\nconst NAZEM_ATTENDANCE_TO_RUWASI', start);
  const deps = {
    recitationIdentityFromReceipt,
    nazemTaskTrack: () => 'memorization', safeJson: value => value,
    loadDailyFollowUp: async () => ({ recitations: [{ id: 7 }, { id: 9 }] }),
    mapRuwasiRecitationGroupToNazem: () => ({ completed: true }), remoteFollowUpMatchesLocal: () => true,
    resolveOpenNazemConflicts: async () => {}, importNazemLinkResult: async () => {},
    enqueueNazemPointReconciliation: async () => {}, reconcileConfirmedRecitationJobs: async () => {},
  };
  const run = new Function(...Object.keys(deps), `${source.slice(start, end)}; return saveRemoteFollowUp;`)(...Object.values(deps));
  const writes = [];
  const connection = { query: async (sql, values) => {
    writes.push({ sql, values });
    if (sql.includes('INSERT INTO nazem_daily')) return [{ insertId: 5 }];
    if (sql.includes('SELECT id, sync_status')) return [[{ id: 5 }]];
    return [{ affectedRows: 1 }];
  } };
  assert.equal((await run(connection, { planId: 1, studentId: 1, teacherId: 2 }, { id: 101, date: '2026-09-14', taskType: 'memorization' })).synced, 1);
  const receipt = writes.find(({ sql }) => sql.includes('UPDATE nazem_recitation_links'));
  assert.deepEqual(receipt.values.slice(1), [5, 2, [7, 9]]);
  assert.equal(writes.some(({ sql }) => /DELETE|UPDATE student_quran/.test(sql)), false);
});

test('a link for an old late amount cannot use today\'s different memorization record', async () => {
  const f = fixture();
  f.mapped.taskType = 'link';
  f.mapped.linkCount = 3;
  f.mapped.nazemLateId = 201;
  f.adapter.readStudentFollowUp = async () => ({ data: { students: [{ student_id: 1, attendance_status: 2,
    items: [{ type: 'conserve', today: { ...f.day, id: 999 }, late_items: [{ ...f.day, id: 201, source_day_id: 101 }] }],
  }] } });
  await assert.rejects(f.adapter.submitLink(f.student, f.plan, f.mapped), { code: 'NAZEM_SAVED_TARGET_CHANGED' });
  assert.equal(f.calls.posts, 0);
});
