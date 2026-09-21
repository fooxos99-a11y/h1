import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { requestNativeNotificationPermission } from '../src/lib/nativeNotificationPermission.js';
import { importNazemFollowUpHistory, markNazemFollowUpRefreshSucceeded } from '../server/integrations/nazem/followUpImport.js';
import { enqueueNazemFollowUpRefresh } from '../server/integrations/nazem/queue.js';
import { mapNazemOwnedPlanSnapshot } from '../server/integrations/nazem/mapping.js';

test('first native entry requests permission once even when multiple consumers mount', async () => {
  let count = 0;
  let resolve;
  const push = {
    checkPermissions: async () => ({ receive: 'prompt' }),
    requestPermissions: () => { count++; return new Promise((done) => { resolve = done; }); },
  };
  const requests = [requestNativeNotificationPermission(push), requestNativeNotificationPermission(push)];
  await Promise.resolve();
  assert.equal(count, 1);
  resolve({ receive: 'granted' });
  assert.deepEqual(await Promise.all(requests), [{ receive: 'granted' }, { receive: 'granted' }]);
});

test('native permission respects a previous denial or grant without prompting again', async () => {
  for (const receive of ['denied', 'granted']) {
    const permission = await requestNativeNotificationPermission({
      checkPermissions: async () => ({ receive }),
      requestPermissions: () => { throw new Error('Unexpected prompt'); },
    });
    assert.equal(permission.receive, receive);
  }
});

test('follow-up import uses exact remote dates and ranges and applies results chronologically', async () => {
  const link = { studentId: 7, planId: 12, teacherId: 4 };
  const today = { date: '2026-09-06', taskType: 'review', surah_from: 2, verse_from: 20, surah_to: 2, verse_to: 30 };
  const calls = [];
  const result = await importNazemFollowUpHistory({
    attendance: [{ date: today.date, status: 'present' }],
    scheduledFollowUps: [today],
    followUps: [{ date: '2026-09-05' }, { date: '2026-09-04' }],
  }, link, {
    applyAttendance: async (id, row) => calls.push(['attendance', id, row.date]),
    syncScheduled: async (target, day) => { assert.equal(target, link); calls.push(['range', day]); return { matched: true }; },
    saveFollowUp: async (target, day) => { assert.equal(target, link); calls.push(['save', day.date]); return { imported: 1 }; },
  });
  assert.equal(calls[1][1], today);
  assert.deepEqual(calls.filter(([kind]) => kind === 'save'), [['save', '2026-09-04'], ['save', '2026-09-05']]);
  assert.equal(result.imported, 2);
});

test('Nazem-owned review snapshot remains authoritative independently of local memorization ranges', () => {
  const revision = { tab: 'المراجعة', startSurah: 'البقرة', startAyah: 1, endSurah: 'البقرة', endAyah: 50 };
  const snapshot = mapNazemOwnedPlanSnapshot({
    track: 'memorization', startSurahName: 'آل عمران', startAyah: 1,
    endSurahName: 'آل عمران', endAyah: 20, dailyPages: 1, linkPages: 0, planVersion: 3,
  }, { revision });
  assert.deepEqual(snapshot.revision, revision);
  assert.equal(snapshot.planVersion, 3);
});

test('amount refresh queues only linked accounts once per scheduled slot', async () => {
  for (const recent of [null, { id: 42 }]) {
    const inserts = [];
    const connection = { query: async (sql, values) => {
      if (sql.includes('FROM app_settings')) return [[{ value: 'true' }]];
      if (sql.includes('FROM nazem_accounts')) return [[{ teacher_id: 4 }]];
      if (sql.includes('SELECT id FROM nazem_sync_jobs')) return [[...(recent ? [recent] : [])]];
      inserts.push(values); return [{ insertId: 42 }];
    } };
    assert.equal(await enqueueNazemFollowUpRefresh(connection, 4, new Date('2026-09-09T01:00:00Z')), 42);
    assert.equal(inserts.length, recent ? 0 : 1);
    if (!recent) {
      assert.equal(inserts[0][2], 'account.refresh_followups');
      assert.equal(inserts[0][1], 'nazem:followups:4:2026-09-09:4');
    }
  }
  let calls = 0;
  assert.equal(await enqueueNazemFollowUpRefresh({ query: async () => { calls++; return [[{ value: 'false' }]]; } }, 4, new Date('2026-09-09T12:00:00Z')), null);
  assert.equal(calls, 1);
});

test('session failures are scoped to the actual recitation day and automatic imports never update remote plans', async () => {
  const server = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
  const query = server.slice(server.indexOf('const [nazemPendingRows]'), server.indexOf('const nazemPendingStudentIds'));
  assert.match(query, /currentAttempt\.session_date = \?/);
  assert.match(query, /\[supervisorId, date\]/);
  const service = await readFile(new URL('../server/integrations/nazem/service.js', import.meta.url), 'utf8');
  const refresh = service.slice(service.indexOf('async function refreshTeacherFollowUps'), service.indexOf('async function reconcileTeacher'));
  assert.match(refresh, /readStudentFollowUpHistory/);
  assert.doesNotMatch(refresh, /loadPlanReviewRange|discoverTeacherData|applyRemotePlanToRuwasi|submitRecitation|upsertPlan/);
});


test('successful follow-up refresh clears stale errors only for its connected teacher', async () => {
  const calls = [];
  await markNazemFollowUpRefreshSucceeded({ query: async (sql, values) => calls.push({ sql, values }) }, 12, 'encrypted-fixture');
  assert.deepEqual(calls[0].values, ['encrypted-fixture', 12]);
  assert.match(calls[0].sql, /last_error_code = NULL, last_error = NULL/);
  assert.match(calls[0].sql, /WHERE teacher_id = \? AND status = 'connected'/);
  const source = await readFile(new URL('../server/integrations/nazem/service.js', import.meta.url), 'utf8');
  const refresh = source.slice(source.indexOf('async function refreshTeacherFollowUps'), source.indexOf('async function reconcileTeacher'));
  assert.ok(refresh.indexOf('throw error;', refresh.indexOf('if (issues.length)')) < refresh.indexOf('await markNazemFollowUpRefreshSucceeded'));
});
