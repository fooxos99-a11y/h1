import test from 'node:test';
import assert from 'node:assert/strict';
import { importNazemFollowUpHistory } from '../server/integrations/nazem/followUpImport.js';
import { mergeCommittedOfflineEvaluation } from '../src/lib/offlineEvaluationMerge.js';

test('current Nazem late availability survives history without replacing a newer local attempt', async () => {
  const late = { date: '2026-09-01', remoteType: 'conserve', surah_from: 2, verse_from: 1, surah_to: 2, verse_to: 10, nazemLate: true, nazemLateAvailableOn: '2026-09-07' };
  const saved = []; const scheduled = [];
  await importNazemFollowUpHistory({ scheduledFollowUps: [late], followUps: [{ ...late, nazemLate: false, status: 'not_completed' }] }, {}, {
    applyAttendance: async () => {},
    syncScheduled: async (_link, day) => { scheduled.push(day); return { matched: true }; },
    saveFollowUp: async (_link, day) => { saved.push(day); return { imported: 1 }; },
  });
  assert.deepEqual(saved, []);
  assert.deepEqual(scheduled, [late]);
});

const queue = [1, 2, 3].map(id => ({ id, studentId: 8, planId: 17, taskType: 'memorization', taskDate: `2026-09-0${id}`, nazemManaged: true }));
const evaluation = { date: '2026-09-07', students: [{ studentId: 8, attendanceStatus: 'present' }], tasks: [queue[0]], taskQueue: queue };
const session = (id, completed = true, status = 'pending') => ({ status, studentId: 8, sessionDate: evaluation.date, tasks: [{ taskId: id, payload: { notMemorized: !completed, offlineOutcome: { completed } } }] });

test('saved late completions wait for fresh Nazem authority without exposing later amounts', () => {
  const sessions = [session(1), session(2)];
  const merged = mergeCommittedOfflineEvaluation(evaluation, sessions);
  assert.deepEqual(merged.tasks.map(task => task.id), []);
  assert.deepEqual(mergeCommittedOfflineEvaluation(merged, sessions).tasks.map(task => task.id), []);
  assert.deepEqual(mergeCommittedOfflineEvaluation(evaluation, sessions).tasks.map(task => task.id), []);
});

test('failed or invalid-sequence completion cannot unlock the next late segment', () => {
  for (const pending of [session(1, false), session(1, true, 'invalid_sequence')]) {
    const merged = mergeCommittedOfflineEvaluation(evaluation, [pending]);
    assert.deepEqual(merged.tasks, []);
    assert.equal(merged.taskQueue[0].locallySaved, true);
  }
});

test('memorization completion does not merge the independent linking queue', () => {
  const link = { ...queue[0], id: 9, taskType: 'link' };
  const merged = mergeCommittedOfflineEvaluation({ ...evaluation, tasks: [queue[0], link], taskQueue: [...queue, link] }, [session(1)]);
  assert.deepEqual(merged.tasks.map(task => task.id).sort((a, b) => a - b), [9]);
});
