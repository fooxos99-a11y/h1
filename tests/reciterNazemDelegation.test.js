import test from 'node:test';
import assert from 'node:assert/strict';
import { loadReciterNazemScope } from '../server/services/reciterNazemScope.js';
import { enqueueNazemRecitation, resolveNazemTeacherForStudent } from '../server/integrations/nazem/queue.js';
import { loadRecitationDeliveryReceipts } from '../server/services/recitationDeliveryReceipts.js';
import { readFile } from 'node:fs/promises';
import { nazemStudentRefreshState } from '../server/integrations/nazem/refreshState.js';
import { canTeacherExecuteQuranTask, getQuranTaskExecutionSource } from '../shared/quran-execution-policy.js';
import { canTeacherSetRecitationAttendance, isRecitationAttendanceVisible } from '../shared/recitation-attendance-policy.js';
import { nazemEvaluationEndDateSql } from '../server/integrations/nazem/evaluationScope.js';

test('reciter refresh scope derives plan owners from assigned committees and linked active rosters', async () => {
  let query;
  const context = await loadReciterNazemScope({ query: async (sql, params) => {
    query = { sql, params };
    return [[{ teacherId: 11, studentId: 1 }, { teacherId: 11, studentId: 2 }, { teacherId: 15, studentId: 3 }]];
  } }, 99);
  assert.deepEqual(context.teacherIds, [11, 15]);
  assert.equal(context.teacherByStudent.get(3), 15);
  assert.deepEqual(query.params, [99]);
  assert.match(query.sql, /sc.supervisor_id = \?/);
  assert.match(query.sql, /plan.status = 'active'/);
  assert.match(query.sql, /roster.status = 'linked' AND roster.roster_active <> 0/);
  assert.match(query.sql, /a.status = 'connected'/);
  assert.deepEqual((await loadReciterNazemScope({ query: async () => [[]] }, 99)).teacherIds, []);
});
test('plan owner wins over evaluating staff account and no names participate in routing', async () => {
  const calls = [];
  const teacherId = await resolveNazemTeacherForStudent({ query: async (sql, params) => {
    calls.push({ sql, params });
    return [[{ teacherId: 11 }]];
  } }, 3, 99, 70);
  assert.equal(teacherId, 11);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, [70, 3]);
  assert.doesNotMatch(calls[0].sql, /name/);
});
test('ambiguous student links never choose a random account', async () => {
  assert.equal(await resolveNazemTeacherForStudent({ query: async () => [[{ teacherId: 11 }, { teacherId: 15 }]] }, 3), null);
});

test('a missing managed plan owner rejects submission instead of silently saving or choosing another teacher', async () => {
  const calls = [];
  const connection = { query: async (sql) => {
    calls.push(sql);
    if (sql.includes('app_settings')) return [[{ value: 'true' }]];
    if (sql.includes('attendance_records')) return [[{ status: 'present' }]];
    if (sql.includes('nazem_plan_links link')) return [[]];
    throw new Error('Unexpected fallback or write');
  } };
  await assert.rejects(enqueueNazemRecitation(connection, { attemptId: 8,
    task: { id: 7, studentId: 3, planId: 70, taskType: 'memorization', nazemManaged: 1 }, actor: { role: 'reciter', id: 99 } }),
  { statusCode: 409, code: 'NAZEM_TEACHER_CONTEXT_MISSING' });
  assert.equal(calls.length, 3);
});
test('reciter receipts follow remote link while preserving evaluator and committee authorization', async () => {
  let query;
  const receipts = await loadRecitationDeliveryReceipts({ query: async (sql, params) => {
    query = { sql, params };
    return [[
      { taskId: 70, linkId: 1, syncStatus: 'synced', confirmedAt: '2026-10-01', remoteSnapshot: '{"id":44}', nazemManaged: 1 },
      { taskId: 71, linkId: 2, syncStatus: 'failed', nazemManaged: 1 },
      { taskId: 72, nazemManaged: 1 },
      { taskId: 73, nazemManaged: 0 },
      { taskId: 74, linkId: 4, syncStatus: 'synced', confirmedAt: '2026-10-01', remoteSnapshot: '{}', nazemManaged: 1 },
    ]];
  } }, 99, '2026-10-01');
  assert.deepEqual(query.params, [99, '2026-10-01', 99]);
  assert.match(query.sql, /a.evaluator_id = \?/);
  assert.match(query.sql, /sc.supervisor_id = \?/);
  assert.doesNotMatch(query.sql, /r.teacher_id = \?|p.teacher_id = a.evaluator_id/);
  assert.deepEqual(receipts.map((row) => row.status), ['nazem_confirmed', 'nazem_failed', 'nazem_pending', 'server_saved', 'nazem_pending']);
});

test('actual evaluation handler refreshes plan teachers, exposes unexecuted Nazem tasks and rejects another staff account', async () => {
  const source = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
  const start = source.indexOf("app.get('/api/supervisors/:id/quran-evaluation'");
  const handlerSource = source.slice(source.indexOf('async (req, res, next)', start), source.indexOf('\n});', start) + 2);
  const calls = [];
  const date = '2026-10-01';
  const students = [{ id: 1, name: 'طالب مرتبط', nazemManaged: 1 }, { id: 2, name: 'طالب آخر', nazemManaged: 1 }];
  const task = { id: 7, studentId: 1, planId: 70, taskDate: date, taskType: 'memorization', track: 'memorization', planTrack: 'memorization', nazemManaged: 1, studentStatus: 'pending' };
  const connection = { release() {}, query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('account.refresh_followups')) return [[{ status: params[0] === 11 ? 'failed' : 'pending', createdEpochMs: Date.now() }]];
    if (sql.includes('SELECT student_id AS studentId, status')) return [[{ studentId: 1, status: 'present' }, { studentId: 2, status: 'present' }]];
    if (sql.includes('t.id,') && sql.includes('FROM student_quran_tasks t')) return [[task]];
    return [[]];
  } };
  const refreshes = [];
  const dependencies = {
    siteConfig: { features: {} },
    nazemEvaluationEndDateSql,
    quranTaskMarkVerseKey: (mark) => `${mark.surah}:${mark.ayah}`,
    db: () => ({ getConnection: async () => connection }),
    isOwnRecitationAccount: (req, id) => ['supervisor', 'reciter'].includes(req.auth?.role) && Number(req.auth.id) === id,
    getSaudiDateTimeParts: () => ({ date }), loadSettings: async () => ({ quranTaskExecutionSource: 'student', nazemIntegrationEnabled: true }),
    loadStaffRecitationPreferences: async () => ({}), isValidDateOnly: () => true,
    getRecitationEvaluationWindow: () => ({ sessionDate: date, previousSessionDate: '2026-09-30', generationEndDate: date }),
    isRecitationSessionDay: () => true, canTeacherSetRecitationAttendance, isRecitationAttendanceVisible,
    ensureSupervisorTeacherModeTasks: async (...args) => { assert.equal(args.at(-1).delegatedReciter, true); return students; },
    addUtcDays: () => date, loadReciterNazemScope: async () => ({ teacherIds: [11, 15], teacherByStudent: new Map([[1, 11], [2, 15]]) }),
    enqueueNazemSessionRefresh: async (_connection, id) => refreshes.push(id), ensureNazemAutomaticAttendance: async () => {},
    getQuranTaskExecutionSource, canTeacherExecuteQuranTask, buildNazemLateTaskExistsSql: () => 'FALSE', nazemTaskRangeSql: () => 'TRUE',
    selectNazemFirstActionableTasks: (rows) => rows, getQuranTaskDisplayMarks: async () => new Map(), buildTeacherExecutionChoices: async () => {},
    loadNazemCompletedStudentIds: async () => new Set([999]), loadRecitationDeliveryReceipts: async (_connection, id) => { assert.equal(id, 99); return []; },
    normalizeTaskRow: (row) => row, normalizeRepeatCount: (value, fallback) => value || fallback, readNazemLinkCount: () => 0,
    getQuranRangeDirection: () => 1, nazemRemainderSuffix: () => '', getTeacherTaskEvaluationPolicy: () => ({}), getRecitationEvaluationMode: () => 'count',
    nazemStudentRefreshState,
  };
  const handler = new Function(...Object.keys(dependencies), `return ${handlerSource}`)(...Object.values(dependencies));
  let response;
  const res = { status(code) { response = { status: code }; return this; }, json(value) { response = { status: response?.status || 200, body: value }; } };
  const next = (error) => { throw error; };
  await handler({ params: { id: '98' }, auth: { role: 'reciter', id: 99 } }, res, next);
  assert.equal(response.status, 403);
  assert.equal(calls.length, 0);
  response = null;
  await handler({ params: { id: '99' }, query: {}, auth: { role: 'reciter', id: 99 } }, res, next);
  assert.equal(response.status, 200);
  assert.deepEqual(refreshes, [11, 15]);
  assert.equal(response.body.tasks[0].id, 7);
  assert.equal(response.body.students[1].amountRefreshPending, true);
  assert.equal(response.body.students[1].nazemRecitationCompleted, false);
  const pending = calls.find((call) => call.sql.includes("operation_type = 'recitation.submit'"));
  assert.deepEqual(pending.params, [11, 15, 1, 2, date]);
  assert.match(pending.sql, /student_id IN \(\?, \?\)/);
});
