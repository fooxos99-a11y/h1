import test from 'node:test';
import assert from 'node:assert/strict';
import { NazemAdapter } from '../server/integrations/nazem/adapter.js';
import { syncNazemScheduledTaskRange } from '../server/integrations/nazem/dailyTasks.js';
import { tasksMatchingNazemRange } from '../server/integrations/nazem/taskRange.js';
import { loadNazemRecitationBarrier } from '../server/integrations/nazem/queue.js';
import { applyRecitationWriteIdentity, recitationWriteJournal } from '../server/integrations/nazem/recitationSubmission.js';
import { incompleteDeliveryRecoveryKey, wakeAcceptedIncompleteNazemDay } from '../server/integrations/nazem/incompleteDeliveryRecovery.js';
import { submitWithNazemAuthority } from '../server/integrations/nazem/recitationAuthority.js';
import { buildNazemLogEntries } from '../server/integrations/nazem/log.js';
import { nazemLogConfirmed, nazemLogStatus } from '../src/lib/nazemLogStatus.js';
import { transientNazemError } from '../server/integrations/nazem/errors.js';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { up as migrateRemainders, down as rollbackRemainders } from '../server/migrations/2026.10.01.1-nazem-partial-remainders.js';
import { nazemRemainderSuffix, scopeNazemRewardTasks } from '../server/integrations/nazem/remainderScope.js';

const day = { id: 11031, source_day_id: 560803, date: '2026-09-20', taskType: 'memorization',
  status: 'pending', nazemLate: true, surah_from: 46, verse_from: 28, surah_to: 46, verse_to: 30 };
const original = { id: 382516, fromSurah: 46, fromAyah: 27, toSurah: 46, toAyah: 30,
  teacherCompleted: 1, studentStatus: 'completed', hasAttempt: 1, deliveryStatus: 'synced',
  deliverySnapshot: { id: 560803, status: 'partial', actual_surah_to: 46, actual_verse_to: 27 },
  deliveryLocal: { fromSurahId: 46, fromAyah: 27, toSurahId: 46, toAyah: 27 } };

test('the confirmed Al-Ahqaf partial creates its remainder once without changing the original evaluation', async () => {
  const tasks = [structuredClone(original)], writes = [];
  const connection = { query: async (sql, values) => {
    if (sql.includes('FROM student_quran_plans')) return [[{ id: 74, studentId: 69, track: 'mastery', linkPages: 0 }]];
    if (sql.includes('INSERT INTO nazem_daily')) return [{ insertId: 1 }];
    if (sql.includes('FROM student_quran_tasks t')) return [tasks];
    if (sql.includes('AS surah, ayah_number')) return [[{ surah: 46, ayah: 28 }]];
    if (sql.includes('AS page FROM quran_ayah_pages')) return [[{ page: 505 }]];
    writes.push({ sql, values });
    if (sql.includes('INSERT INTO student_quran_tasks')) tasks.push({ id: 9, fromSurah: values[7], fromAyah: values[8], toSurah: values[9], toAyah: values[10], studentStatus: 'pending' });
    return [{ affectedRows: 1 }];
  } };
  const link = { teacherId: 12, studentId: 69, planId: 74 };
  const first = await syncNazemScheduledTaskRange(connection, link, day, { inTransaction: true });
  assert.equal(first.remainder, true);
  assert.equal((await syncNazemScheduledTaskRange(connection, link, day, { inTransaction: true })).changed, false);
  assert.deepEqual(tasks[0], original);
  assert.equal(writes.filter(write => write.sql.includes('INSERT INTO student_quran_tasks')).length, 1);
  assert.equal(writes.find(write => write.sql.includes('INSERT INTO student_quran_tasks')).values[19], '560803:46:28:46:30');
  assert.equal(writes.some(write => /DELETE|UPDATE student_quran/.test(write.sql)), false);
  assert.deepEqual(tasksMatchingNazemRange(tasks, day).map(task => task.id), [9]);
  assert.deepEqual(tasksMatchingNazemRange(tasks, { ...day, verse_from: 27 }).map(task => task.id), [382516]);
});

test('an unproved changed range never becomes a new remainder', async () => {
  for (const change of [{ deliveryStatus: 'pending' }, { deliverySnapshot: { ...original.deliverySnapshot, id: 999 } },
    { deliveryLocal: { ...original.deliveryLocal, toAyah: 26 } }]) {
    let writes = 0;
    const connection = { query: async sql => {
      if (sql.includes('FROM student_quran_plans')) return [[{ id: 74, studentId: 69, track: 'mastery' }]];
      if (sql.includes('INSERT INTO nazem_daily')) return [{ insertId: 1 }];
      if (sql.includes('AS page FROM quran_ayah_pages')) return [[{ page: 505 }]];
      if (sql.includes('FROM student_quran_tasks t')) return [[{ ...original, ...change }]];
      writes++; return [[]];
    } };
    assert.equal((await syncNazemScheduledTaskRange(connection, { planId: 74, studentId: 69, teacherId: 12 }, day, { inTransaction: true })).reason, 'task_started');
    assert.equal(writes, 0);
  }
});

test('the outgoing remainder contains only its own attempt, not the already evaluated prefix', async () => {
  const task = { id: 9, planId: 74, studentId: 69, taskDate: day.date, taskType: 'memorization', track: 'memorization' };
  const rows = [{ ...original, taskType: 'memorization', attemptId: 4803 },
    { id: 9, taskType: 'memorization', fromSurah: 46, fromAyah: 28, toSurah: 46, toAyah: 30, attemptId: 6200 }];
  const connection = { query: async sql => sql.includes('remote_snapshot AS remote') ? [[{ remote: day }]] : [rows] };
  assert.equal((await loadNazemRecitationBarrier(connection, task, 'memorization', 12)).attemptSignature, '6200');
  assert.equal((await loadNazemRecitationBarrier(connection, { ...task, id: original.id }, 'memorization', 12)).ready, false);
});

const acceptedFixture = () => {
  const source = { ...day, id: 945729, date: '2026-09-29', nazemLate: false, surah_from: 60, verse_from: 6, surah_to: 60, verse_to: 9 };
  const payload = { taskType: 'memorization', taskDate: source.date, submissionTarget: { source, attemptIds: [6132] },
    deliveryWrites: [{ path: '/educational-plans/item-days/945729/not-completed', startedAt: '2026-09-30T20:30:56Z', acceptedAt: '2026-09-30T20:30:57Z' }] };
  const remote = { ...source, id: 12980, source_day_id: 945729, nazemLate: true };
  return { source, payload, remote, attemptCompleted: 0 };
};

test('the accepted not-completed day moved to a late is verified without another POST, including after restart', async () => {
  const f = acceptedFixture(), adapter = new NazemAdapter();
  const mapped = { date: f.source.date, taskType: 'memorization', completed: false, nazemSourceDayId: '945729', nazemSavedTarget: f.source,
    fromSurahId: 60, fromAyah: 6, scheduledToSurahId: 60, scheduledToAyah: 9 };
  const job = { payload: f.payload };
  applyRecitationWriteIdentity(mapped, job, false);
  let posts = 0;
  adapter.resolveRecitationFollowUp = async () => ({ late: f.remote });
  adapter.postFollowUpApi = async () => { posts++; };
  const result = await submitWithNazemAuthority({ adapter, mapped });
  assert.equal(result.verifiedAcceptedWrite, true);
  assert.equal(result.latePending, true);
  assert.equal(posts, 0);
  const live = { ...mapped, acceptedIncompleteDayId: null };
  adapter.recitationJournal = recitationWriteJournal({ query: async () => [{ affectedRows: 1 }] }, job);
  assert.equal((await adapter.verifyResolvedRecitation({ late: f.remote }, null, live)).verifiedAcceptedWrite, true);
  f.remote.source_day_id = 999;
  await assert.rejects(adapter.verifySubmittedRecitation(null, null, mapped), { code: 'NAZEM_DELIVERY_UNVERIFIED' });
  assert.equal(posts, 0);
});

test('repair reawakens only an accepted incomplete attempt with the exact current late identity, once', async () => {
  const f = acceptedFixture();
  assert.ok(incompleteDeliveryRecoveryKey(f));
  for (const change of [{ attemptCompleted: 1 }, { remote: { ...f.remote, source_day_id: 999 } },
    { remote: { ...f.remote, verse_from: 7 } }, { remote: { ...f.remote, date: '2026-09-28' } },
    { payload: { ...f.payload, deliveryWrites: [{ ...f.payload.deliveryWrites[0], acceptedAt: null }] } }]) {
    assert.equal(incompleteDeliveryRecoveryKey({ ...f, ...change }), null);
  }
  let updates = 0;
  const row = { ...f, id: 28041 };
  const connection = { query: async sql => {
    if (sql.startsWith('SELECT')) return [[row]];
    updates++;
    row.payload.incompleteDeliveryRecoveryKey = incompleteDeliveryRecoveryKey(row);
    return [{ affectedRows: 1 }];
  } };
  assert.equal(await wakeAcceptedIncompleteNazemDay(connection, { teacherId: 11, studentId: 157, planId: 89 }), 1);
  assert.equal(await wakeAcceptedIncompleteNazemDay(connection, { teacherId: 11, studentId: 157, planId: 89 }), 0);
  assert.equal(updates, 1);
});

test('roster reads retry transport once and refuse changed totals without publishing partial profiles', async () => {
  const adapter = new NazemAdapter();
  const calls = [];
  adapter.getPlanApi = async path => {
    calls.push(path);
    if (calls.length === 1) throw transientNazemError('timeout', 'NAZEM_PLAN_API_TIMEOUT');
    const current = path.endsWith('=1') ? 1 : 2;
    return { data: { current_page: current, last_page: 2, total: current === 1 ? 2 : 3, next_page_url: '?page=2', data: [{ id: current, name: 'طالب' }] } };
  };
  await assert.rejects(adapter.getStudentProfiles(), error => error.code === 'NAZEM_STUDENT_PROFILES_FAILED' && error.details.pageNumber === 2);
  assert.deepEqual(calls, ['/api/students?page=1', '/api/students?page=1', '/api/students?page=2']);
  assert.equal(adapter.verifiedStudentProfiles, null);
});

test('log distinguishes incomplete late work and roster failures, and exposes only safe review details', () => {
  const [entry] = buildNazemLogEntries([{ status: 'synced', latePending: 'true', resultStatus: 'not_completed',
    metadata: { secret: 'must not leave server', diagnostics: { issues: [{ studentId: 69, taskDate: day.date, taskType: 'memorization', code: 'NAZEM_STARTED_TASK_RANGE_CHANGED', token: 'hidden' }] } } }]);
  assert.equal(nazemLogStatus(entry), 'المتأخر لم يكتمل');
  assert.equal(nazemLogConfirmed(entry), false);
  assert.equal(entry.metadata, undefined);
  assert.equal(entry.diagnostics.issues[0].token, undefined);
  assert.equal(nazemLogStatus({ status: 'failed', operationType: 'account.refresh_followups' }), 'تعذر التحديث');
  assert.equal(nazemLogStatus({ status: 'synced', latePending: false, alreadyRecorded: true }), 'مؤكد في ناظم');
});

test('queue recovery wakes the oldest memorization before its link even when the link has the smaller job ID', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.function('JSON_UNQUOTE', value => value);
    database.function('NOW', { varargs: true }, () => '2026-10-01 09:00:00');
    database.function('GREATEST', { varargs: true }, (...values) => Math.max(...values));
    database.exec(`CREATE TABLE nazem_sync_jobs(id INTEGER, teacher_id INTEGER, student_id INTEGER,
      operation_type TEXT, status TEXT, last_error_code TEXT, payload_json TEXT, max_attempts INTEGER,
      attempt_count INTEGER, next_attempt_at TEXT, lease_owner TEXT, lease_expires_at TEXT, last_heartbeat_at TEXT)`);
    const insert = database.prepare(`INSERT INTO nazem_sync_jobs(id,teacher_id,student_id,operation_type,status,
      last_error_code,payload_json,max_attempts,attempt_count) VALUES(?,11,10,'recitation.submit','blocked',?,?,2,5)`);
    insert.run(24170, 'NAZEM_LINK_WAITING_FOR_MEMORIZATION', JSON.stringify({ taskDate: '2026-09-15', taskType: 'link' }));
    insert.run(24171, 'NAZEM_PREVIOUS_DAYS_BLOCKING', JSON.stringify({ taskDate: '2026-09-15', taskType: 'memorization' }));
    insert.run(24169, 'NAZEM_PREVIOUS_DAYS_BLOCKING', JSON.stringify({ taskDate: '2026-09-16', taskType: 'memorization' }));
    const source = readFileSync(new URL('../server/integrations/nazem/service.js', import.meta.url), 'utf8');
    const start = source.indexOf('async function wakeNextBlockedNazemRecitation(');
    const end = source.indexOf('async function syncAttendance(', start);
    const run = new Function('reconcileConfirmedRecitationJobs', `${source.slice(start, end)}; return wakeNextBlockedNazemRecitation;`)(async () => {});
    const connection = { query: async (sql, values) => {
      const statement = database.prepare(sql);
      return sql.trim().startsWith('SELECT') ? [statement.all(...values)] : [{ affectedRows: statement.run(...values).changes }];
    } };
    assert.equal(await run(connection, { teacherId: 11, studentId: 10, id: 28039 }), 24171);
    assert.equal(await run(connection, { teacherId: 11, studentId: 10, id: 28039 }), null);
    database.exec("UPDATE nazem_sync_jobs SET status='synced' WHERE id=24171");
    assert.equal(await run(connection, { teacherId: 11, studentId: 10, id: 24171 }), 24170);
  } finally { database.close(); }
});

test('authenticated user reads establish an API session without opening the plans table, and reject other hosts or rejected sessions', () => {
  const adapter = new NazemAdapter();
  const response = ({ host = 'api.nazem-plus.com', status = 200, path = '/api/user', auth = true, contentType = 'application/json' } = {}) => ({
    url: () => `https://${host}${path}`, status: () => status,
    headers: () => ({ 'content-type': contentType }),
    request: () => ({ method: () => 'GET', headers: () => ({ ...(auth ? { authorization: 'synthetic-test-token' } : {}),
      'x-company-id': 'synthetic-company', 'unrelated-header': 'discard' }) }),
  });
  for (const change of [{ host: 'other.example' }, { status: 401 }, { path: '/api/app-configs' }, { contentType: 'text/html' }]) {
    assert.equal(adapter.captureAuthenticatedApiResponse(response(change)), false);
    assert.equal(adapter.planApiBase, '');
  }
  assert.equal(adapter.captureAuthenticatedApiResponse(response()), true);
  assert.equal(adapter.planApiBase, 'https://api.nazem-plus.com');
  assert.equal(adapter.planApiHeaders['x-company-id'], 'synthetic-company');
  assert.equal(adapter.planApiHeaders['unrelated-header'], undefined);
  assert.equal(adapter.captureAuthenticatedApiResponse(response({ auth: false })), true);
  assert.equal(adapter.planApiHeaders.authorization, undefined);
});

test('the remainder identity permits an overlapping page pair but still rejects duplicate original and remainder tasks', async () => {
  const statements = [];
  await migrateRemainders({ query: async sql => {
    statements.push(sql);
    return [[{ count: 0 }]];
  } });
  const indexSql = statements.find(sql => sql.includes('ADD UNIQUE KEY'));
  const columns = /ADD UNIQUE KEY student_quran_task_unique\s*\(([^)]+)\)/.exec(indexSql)[1];
  const database = new DatabaseSync(':memory:');
  try {
    database.exec(`CREATE TABLE student_quran_tasks(plan_id INTEGER,task_date TEXT,task_type TEXT,track TEXT,
      from_page INTEGER,to_page INTEGER,nazem_remainder_key TEXT NOT NULL DEFAULT '', teacher_completed INTEGER);
      CREATE UNIQUE INDEX student_quran_task_unique ON student_quran_tasks(${columns})`);
    const insert = database.prepare('INSERT INTO student_quran_tasks VALUES(74,?,?,?,?,?,?,?)');
    const tuple = ['2026-09-20', 'memorization', 'memorization', 505, 506];
    insert.run(...tuple, '', 1);
    insert.run(...tuple, '560803:46:28:46:30', null);
    assert.throws(() => insert.run(...tuple, '', 1), /UNIQUE/);
    assert.throws(() => insert.run(...tuple, '560803:46:28:46:30', null), /UNIQUE/);
    assert.equal(database.prepare('SELECT teacher_completed FROM student_quran_tasks WHERE nazem_remainder_key=?').get('').teacher_completed, 1);
    await assert.rejects(rollbackRemainders({ query: async sql => [database.prepare(sql).all()] }), /Cannot roll back/);
  } finally { database.close(); }
  const alreadyApplied = [];
  await migrateRemainders({ query: async sql => { alreadyApplied.push(sql); return [[{ count: 1 }]]; } });
  assert.equal(alreadyApplied.some(sql => sql.includes('ALTER TABLE')), false);
});

test('remainder rewards isolate the new task and preserve the original memorization, repetition and link rewards', () => {
  const rows = [{ ...original, taskType: 'memorization', nazemRemainderKey: '', points: 20 },
    { id: 9, fromSurah: 46, fromAyah: 28, toSurah: 46, toAyah: 30, taskType: 'memorization', nazemRemainderKey: '560803:46:28:46:30' },
    { id: 10, taskType: 'repeat', points: 30 }, { id: 11, taskType: 'link', points: 10 }];
  const daily = { taskType: 'memorization', localSnapshot: { nazemSavedTarget: day } };
  assert.deepEqual(scopeNazemRewardTasks(daily, rows).map(row => row.id), [9]);
  assert.deepEqual(scopeNazemRewardTasks({ ...daily, localSnapshot: { nazemSavedTarget: { ...day, verse_from: 27 } } }, rows).map(row => row.id), [382516, 10, 11]);
  assert.notEqual(nazemRemainderSuffix(rows[0]), nazemRemainderSuffix(rows[1]));
  assert.throws(() => scopeNazemRewardTasks({ taskType: 'memorization' }, rows), error => error.statusCode === 409);
  assert.equal(rows[0].points, 20);
});
