import { importNazemFollowUpHistory } from '../server/integrations/nazem/followUpImport.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { dueNazemReconciliationPhases } from '../server/services/nazemReconciliationSchedule.js';
import { calculateEvaluatedGroupReward } from '../server/services/recitationRewards.js';
import { calculateNazemRewardGroups, enqueueNazemPointReconciliation, settleNazemPoints } from '../server/services/nazemPointReconciliation.js';
import { normalizeRecitationRewardSettings } from '../shared/recitation-reward-settings.js';
import { loadNazemReconciliationReport, reconciliationStatus } from '../server/services/nazemReconciliationReport.js';
import { recitationFacesFromLines } from '../server/services/recitationSegments.js';
import { finalizeRecitationTask } from '../server/services/offlineRecitation.js';
import { nazemFollowUpMetricsMatch } from '../server/integrations/nazem/followUpMetrics.js';
import { importNazemLinkResult } from '../server/integrations/nazem/linkResultImport.js';

test('nightly and closing phases refer to the correct Riyadh business day and catch missed minutes', () => {
  const due = (iso) => dueNazemReconciliationPhases(new Date(iso), '2026-09-08');
  assert.deepEqual(due('2026-09-08T22:59:00Z'), []);
  assert.deepEqual(due('2026-09-08T23:12:00Z'), [{ date: '2026-09-08', phase: 'nightly' }]);
  assert.deepEqual(due('2026-09-08T23:50:00Z').map((row) => row.phase), ['nightly', 'retry']);
  assert.deepEqual(due('2026-09-09T00:04:00Z'), []);
  assert.deepEqual(due('2026-09-09T00:05:00Z').map((row) => row.date), Array(3).fill('2026-09-08'));
  assert.deepEqual(due('2026-09-09T08:00:00Z'), due('2026-09-09T00:05:00Z'));
  assert.deepEqual(dueNazemReconciliationPhases(new Date(), ''), []);
});

test('failed and incomplete group members cannot leave a previous successful group reward', () => {
  const passed = { evaluatedAt: '2026-09-08', teacherCompleted: 1, evaluationScore: 12 };
  assert.equal(calculateEvaluatedGroupReward([passed, { ...passed, evaluationScore: 10 }]), 11);
  assert.equal(calculateEvaluatedGroupReward([passed, { ...passed, teacherCompleted: 0 }]), 0);
  assert.equal(calculateEvaluatedGroupReward([passed, { evaluationScore: 12 }]), 0);
  assert.equal(calculateEvaluatedGroupReward([]), 0);
});

test('remote reward settlement uses the shared score, repeat and listening settings without multiplying imports', async () => {
  const settings = normalizeRecitationRewardSettings({ pointsSystemEnabled: 'true', memorizationRepeatPointValue: '1', memorizationListeningPointValue: '10' });
  const primary = { id: 1, taskType: 'memorization', track: 'memorization', planTrack: 'mastery',
    teacherCompleted: 1, evaluatedAt: '2026-09-08', evaluationScore: 12 };
  const repeat = { id: 2, taskType: 'repeat', track: 'memorization', actualRepeatCount: 30, actualListeningCount: 1 };
  const calculate = () => calculateNazemRewardGroups({}, { taskType: 'memorization', track: 'memorization' }, [primary, repeat], settings);
  assert.deepEqual((await calculate()).map((group) => group.points), [12, 11]);
  assert.deepEqual(await calculate(), await calculate());
  primary.teacherCompleted = 0;
  assert.deepEqual((await calculate()).map((group) => group.points), [0, 0]);
  assert.equal(recitationFacesFromLines({ surah: 1, ayah: 1 }, { surah: 1, ayah: 7 }), 0.5);
});

test('snapshot queue and reward settlement reject history and retain the accepted evaluation', async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'), commit: async () => calls.push('commit'), rollback: async () => calls.push('rollback'),
    query: async (sql, values) => {
      const q = sql.replace(/\s+/g, ' ');
      calls.push(q);
      if (q.startsWith('INSERT INTO nazem_point_reconciliations')) { assert.match(q, /source_hash <> VALUES\(source_hash\)/); return [{}]; }
      if (q.startsWith('SELECT ruwasi_student_id')) return [[{ studentId: 1 }]];
      if (q.startsWith('SELECT id FROM students')) return [[{ id: 1 }]];
      if (q.includes('work.source_hash AS sourceHash')) return [[{ id: 1, studentId: 1, planId: 7, teacherId: 3, taskDate: '2026-09-07', taskType: 'review', track: 'memorization', syncStatus: 'synced', status: 'pending', sourceHash: 'version' }]];
      if (q.includes("setting_key = 'nazemPointsStartDate'")) return [[{ value: '2026-09-08' }]];
      if (q.includes('FROM student_quran_tasks task')) return [[{ id: 1, taskType: 'review', track: 'memorization', evaluatedAt: '2026-09-07', teacherCompleted: 1, evaluationScore: 8, points: 0 }]];
      if (q === 'SELECT setting_key, setting_value FROM app_settings') return [[{ setting_key: 'pointsSystemEnabled', setting_value: 'true' }]];
      if (q.includes('FROM student_point_transactions')) return [[{ total: 0 }]];
      if (q.startsWith('UPDATE nazem_point_reconciliations')) { assert.match(q, /source_hash = \?/); assert.equal(values.at(-1), 'version'); return [{}]; }
      throw new Error(`Unexpected SQL: ${q}`);
    },
  };
  await enqueueNazemPointReconciliation(connection, 1, { id: 9 });
  assert.equal(await settleNazemPoints(connection, 1), false);
  assert.ok(calls.indexOf('rollback') < calls.findIndex((q) => q.startsWith('UPDATE nazem_point_reconciliations')));
  assert.equal(calls.some((q) => /UPDATE student_quran_tasks|DELETE FROM student_point_transactions/.test(q)), false);
});

test('report needs evidence from both systems and points, and scopes teachers on the server', async () => {
  const base = { remoteCheckedAt: '2026-09-08T10:00:00Z', pointsCheckedAt: '2026-09-08T10:00:00Z', dailyId: 1, remoteStatus: 'synced', remoteRecordId: '9', localAccepted: 1, pointsStatus: 'synced', expectedPoints: 12, recordedPoints: 12 };
  assert.equal(reconciliationStatus(base), 'matched');
  assert.equal(reconciliationStatus({ ...base, remoteRecordId: null }), 'local_only');
  assert.equal(reconciliationStatus({ ...base, localAccepted: 0 }), 'remote_only');
  assert.equal(reconciliationStatus({ ...base, pointsStatus: null }), 'points_pending');
  const connection = { query: async (sql, values) => {
    if (sql.includes('FROM nazem_daily_follow_up_links daily')) { assert.match(sql, /daily.teacher_id = \?/); assert.match(sql, /sc.committee_id = student.committee_id/); assert.deepEqual(values, ['2026-09-08', '2026-09-08', 3, 3]); return [[base]]; }
    assert.match(sql, /teacher.id = \?/); assert.deepEqual(values, [3]); return [[]];
  } };
  assert.equal((await loadNazemReconciliationReport(connection, { role: 'supervisor', id: 3 }, { from: '2026-09-08' })).rows[0].status, 'matched');
  await assert.rejects(loadNazemReconciliationReport(connection, { role: 'supervisor', id: 3 }, { from: '2026-02-31' }), /فترة صحيحة/);
});

test('server submission is complete only after every expected task is accepted', async () => {
  const parts = new Set();
  const statuses = [];
  const connection = { query: async (sql, values) => {
    if (sql.includes('INSERT INTO student_quran_recitation_session_parts')) parts.add(values[1]);
    if (sql.includes('AS acceptedParts')) return [[{ acceptedParts: parts.size }]];
    if (sql.includes('UPDATE student_quran_recitation_submissions')) statuses.push(values[0]);
    return [{}];
  } };
  const req = { recitationSessionTaskIds: [1, 2], auth: { role: 'supervisor', id: 8 } };
  for (const id of [1, 2, 2]) await finalizeRecitationTask(connection, { claim: { sessionId: 'same', deviceId: 'device' }, req, task: { id, taskType: 'memorization' }, result: { ok: true } });
  assert.deepEqual(statuses, ['pending', 'accepted', 'accepted']);
});

test('changing repetition, listening or linking cannot be mistaken for an unchanged remote result', () => {
  const day = { taskType: 'memorization', remoteType: 'conserve', repetition: 10, hearing: 1, link: 5 };
  const local = { repeatCount: 10, listeningCount: 1, linkCount: 5 };
  assert.equal(nazemFollowUpMetricsMatch(day, local), true);
  for (const patch of [{ repetition: 30 }, { hearing: 0 }, { link: 0 }]) assert.equal(nazemFollowUpMetricsMatch({ ...day, ...patch }, local), false);
});

test('a matching remote link count preserves the locally evaluated score, and an unproven count grants nothing', async () => {
  const writes = [];
  const connection = { query: async (sql) => {
    if (sql.includes('FROM nazem_plan_links')) return [[{ expectedCount: '5' }]];
    if (sql.includes('FROM student_quran_tasks')) return [[{ id: 1, evaluatedAt: '2026-09-08', teacherCompleted: 1, actualLinkCount: 5 }]];
    writes.push(sql); return [{}];
  } };
  const link = { teacherId: 1, planId: 2, studentId: 3 };
  for (const count of [5, 3, null]) await importNazemLinkResult(connection, link, { id: 4, taskType: 'memorization', remoteType: 'conserve', status: 'completed', link: count }, 8);
  assert.deepEqual(writes, []);
});


test('attendance requiring review cannot discard an imported recitation', async () => {
  const calls = [];
  const result = await importNazemFollowUpHistory({ attendance: [{}], followUps: [{ date: '2026-09-08' }] }, {}, {
    applyAttendance: async () => false,
    syncScheduled: async () => ({ matched: true }),
    saveFollowUp: async () => { calls.push('saved'); return { imported: 1 }; },
  });
  assert.deepEqual(calls, ['saved']);
  assert.equal(result.review, 1);
  assert.equal(result.imported, 1);
});

test('a changed remote link count cannot settle an old local link reward', async () => {
  const tasks = [
    { id: 1, taskType: 'memorization', track: 'memorization', planTrack: 'mastery', evaluatedAt: '2026-09-08', teacherCompleted: 1, evaluationScore: 12 },
    { id: 2, taskType: 'link', track: 'memorization', evaluatedAt: '2026-09-08', teacherCompleted: 1, evaluationScore: 8, actualLinkCount: 5 },
  ];
  await assert.rejects(calculateNazemRewardGroups({}, { taskType: 'memorization', track: 'memorization', remoteResultStatus: 'completed', remoteLinkCount: 3 }, tasks, {}), /الربط/);
  await assert.rejects(loadNazemReconciliationReport({}, { role: 'supervisor', id: 3 }, { committeeId: 'invalid' }), /الحلقة/);
});

test('settlement commits once, skips replay, and rolls back a failed ledger write', async () => {
  for (const failWrite of [false, true]) {
    let state = { points: 0, taskPoints: 0, ledger: 0, status: 'pending' };
    let snapshot;
    const connection = {
      beginTransaction: async () => { snapshot = { ...state }; },
      commit: async () => {},
      rollback: async () => { state = snapshot; },
      query: async (sql, values) => {
        const q = sql.replace(/\s+/g, ' ').trim();
        if (q.startsWith('SELECT ruwasi_student_id')) return [[{ studentId: 1 }]];
        if (q.startsWith('SELECT id FROM students')) return [[{ id: 1 }]];
        if (q.includes('work.source_hash AS sourceHash')) return [[{ id: 1, studentId: 1, planId: 7, teacherId: 3, taskDate: '2026-09-08', taskType: 'review', track: 'memorization', syncStatus: 'synced', status: state.status, sourceHash: 'version' }]];
        if (q.includes("setting_key = 'nazemPointsStartDate'")) return [[{ value: '2026-09-08' }]];
        if (q.includes('FROM student_quran_tasks task')) return [[{ id: 1, taskType: 'review', track: 'memorization', evaluatedAt: '2026-09-08', teacherCompleted: 1, evaluationScore: 8, points: state.taskPoints }]];
        if (q === 'SELECT setting_key, setting_value FROM app_settings') return [[{ setting_key: 'pointsSystemEnabled', setting_value: 'true' }, { setting_key: 'maxDailyStudentPoints', setting_value: '78' }]];
        if (q.includes('FROM student_quran_tasks WHERE id IN')) return [[{ points: state.taskPoints }]];
        if (q.startsWith('SELECT points, committee_id')) return [[{ points: state.points, committeeId: null }]];
        if (q.includes('FROM student_point_transactions')) return [[{ total: state.ledger, rewardLedger: state.ledger, rewardToday: state.ledger, awardedToday: state.ledger }]];
        if (q.startsWith('UPDATE students')) { state.points = values[0]; return [{}]; }
        if (q.startsWith('UPDATE student_quran_tasks')) { state.taskPoints = values[1]; return [{}]; }
        if (q.startsWith('DELETE FROM student_point_transactions')) { state.ledger = 0; return [{}]; }
        if (q.startsWith('INSERT INTO student_point_transactions')) {
          assert.equal(values[6], 'اعتماد المراجعة من ناظم');
          if (failWrite) throw new Error('injected write failure');
          state.ledger = values[5]; return [{}];
        }
        if (q.startsWith('UPDATE nazem_point_reconciliations')) { assert.deepEqual(values, [8, 8, 1]); state.status = 'synced'; return [{}]; }
        throw new Error(`Unexpected SQL: ${q}`);
      },
    };
    if (failWrite) {
      await assert.rejects(settleNazemPoints(connection, 1), /injected write failure/);
      assert.deepEqual(state, { points: 0, taskPoints: 0, ledger: 0, status: 'pending' });
    } else {
      assert.equal(await settleNazemPoints(connection, 1), true);
      assert.equal(await settleNazemPoints(connection, 1), false);
      assert.deepEqual(state, { points: 8, taskPoints: 8, ledger: 8, status: 'synced' });
    }
  }
});
