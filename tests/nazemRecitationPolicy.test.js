import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { countEvaluationItems, hasNazemFixedRange, isNazemLinkTask, isNazemMasteryTask, readNazemLinkCount, resolveTaskRecitationMode } from '../shared/nazem-recitation-policy.js';
import { defaultAccountSection } from '../src/lib/defaultAccountSection.js';

const server = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
const link = { id: 10, taskType: 'link', nazemManaged: true };

test('loading an evaluated Nazem link does not recalculate its memorized ranges', async () => {
  let rangeCalls = 0;
  const context = vm.createContext({ getNazemLinkRanges: async () => { rangeCalls += 1; return []; } });
  vm.runInContext(server.slice(server.indexOf('async function ensureNazemLinkTasks('), server.indexOf('async function advancePlanAfterCompletedMemorization(')), context);
  for (const saved of [{ completed: 1 }, { completed: 0 }, { actor: 'teacher' }, { hasAttempt: 1 }]) {
    const connection = { query: async (sql) => sql.includes('SELECT id FROM nazem_daily_follow_up_links') ? [[{ id: 1 }]] : [[saved]] };
    await context.ensureNazemLinkTasks(connection, { id: 1, studentId: 2 }, '2026-09-06');
  }
  assert.equal(rangeCalls, 0);
});

test('Nazem link always opens one count form; other tasks keep their preferred mode', () => {
  assert.equal(resolveTaskRecitationMode(link, 'mushaf'), 'count');
  assert.deepEqual(countEvaluationItems([link, { ...link, id: 11 }]), [{ id: 10 }]);
  assert.deepEqual(countEvaluationItems([
    { id: 1, taskType: 'memorization', amount: 'الوجه الأول' },
    { id: 2, taskType: 'memorization', amount: 'الوجه الثاني' },
  ]), [{ id: 1, label: 'الوجه الأول' }, { id: 2, label: 'الوجه الثاني' }]);
  for (const task of [{ ...link, nazemManaged: false }, { ...link, taskType: 'review' }]) {
    assert.equal(resolveTaskRecitationMode(task, 'mushaf'), 'mushaf');
    assert.equal(resolveTaskRecitationMode(task, 'count'), 'count');
  }
  assert.equal(hasNazemFixedRange({ ...link, taskType: 'review' }), false);
  assert.equal(hasNazemFixedRange({ ...link, taskType: 'memorization' }), false);
  assert.equal(hasNazemFixedRange({ ...link, nazemManaged: false }), false);
});

test('remote automatic count preserves zero and never invents a missing amount', () => {
  for (const value of [0, 5, 7, 40, '9']) assert.equal(readNazemLinkCount(value), Number(value));
  for (const value of [null, undefined, '', -1, 41, 2.5, 'invalid']) assert.equal(readNazemLinkCount(value), null);
});

test('server enforces Nazem count mode before teacher preferences', () => {
  const context = vm.createContext({ isNazemLinkTask, isNazemMasteryTask, getRecitationEvaluationType: (task) => task.taskType });
  vm.runInContext(server.slice(server.indexOf('function getRecitationEvaluationMode('), server.indexOf('async function markExpiredPendingQuranTasks(')), context);
  assert.equal(context.getRecitationEvaluationMode({}, link, 'supervisor', { linkMode: 'mushaf' }), 'count');
  assert.equal(context.getRecitationEvaluationMode({}, { ...link, nazemManaged: false }, 'supervisor', { linkMode: 'mushaf' }), 'mushaf');
});

test('multiple local link ranges send the remote count exactly once, independent of faces and errors', async () => {
  const start = server.indexOf('async function saveEvaluatedNazemLinkCount(');
  const end = server.indexOf('async function restoreLateNazemTaskBounds(', start);
  const code = server.slice(start, end);
  for (const automaticCount of [5, 7, 40]) {
    const stored = [];
    for (const taskId of [10, 11]) {
      const context = vm.createContext({
        task: { ...link, planId: 1, studentId: 2, taskDate: '2026-09-06', nazemLinkCount: automaticCount },
        taskId, evaluatedFaces: 0.25, notMemorized: false, readNazemLinkCount,
        connection: { query: async (sql, params) => {
          if (sql.includes('SELECT MIN(id)')) return [[{ id: 10 }]];
          if (sql.includes('actual_link_count = ?')) stored.push(params[0]);
          return [];
        } },
      });
      vm.runInContext(code, context);
      await context.saveEvaluatedNazemLinkCount(context.task, context.connection, context.notMemorized, context.taskId);
    }
    assert.deepEqual(stored, [automaticCount, 0]);
  }
});

test('teacher lands on recitation before and after attendance loads without changing other roles', () => {
  const sections = [{ key: 'staffAttendance' }, { key: 'quranEvaluation' }];
  for (const role of ['supervisor', 'reciter']) {
    assert.equal(defaultAccountSection(role, sections), 'quranEvaluation');
    assert.equal(defaultAccountSection(role, sections.slice(1)), 'quranEvaluation');
  }
  assert.equal(defaultAccountSection('manager', sections), 'staffAttendance');
  assert.equal(defaultAccountSection('student', [{ key: 'quranSessions' }]), 'quranSessions');
  assert.equal(defaultAccountSection('supervisor', []), '');
});

test('Nazem review range API accepts partial and scheduled ends but rejects extension', async () => {
  const route = server.slice(server.indexOf("app.post('/api/supervisors/:id/quran-evaluation/:taskId/range'"));
  const code = route.slice(route.indexOf('      const fixedRange ='), route.indexOf('      for (let index = 0; index < tasks.length;'));
  for (const end of [4, 5, 6]) {
    let status = null;
    const context = vm.createContext({
      nazemLate: false, anchor: { taskType: 'review' }, expectedStart: { page: 1 }, expectedEnd: { page: 5 }, planEnd: { page: 10 }, direction: 1,
      req: { body: { actualEnd: { page: end } } },
      resolveExecutionEndPosition: async (_connection, position) => position,
      isSameQuranPosition: (a, b) => a.page === b.page,
      compareQuranPositionInDirection: (a, b) => a.page - b.page,
      connection: { rollback: async () => {} },
      res: { status: (value) => { status = value; return { json: () => {} }; } },
    });
    await vm.runInContext(`(async () => {${code}})()`, context);
    assert.equal(status, end <= 5 ? null : 422);
  }
});
