import test from 'node:test';
import assert from 'node:assert/strict';
import { canMarkNazemNotCompleted, nazemNotCompletedLabel } from '../shared/nazem-recitation-policy.js';
import { mapRuwasiRecitationToNazem } from '../server/integrations/nazem/mapping.js';
import { NazemAdapter } from '../server/integrations/nazem/adapter.js';

for (const [taskType, track, remoteType, label] of [
  ['review', 'memorization', 'revision', 'لم تتم المراجعة'],
  ['memorization', 'mastery', 'master', 'لم يتم الإتقان'],
]) {
  test(`Nazem ${remoteType} accepts not completed without advancing the range`, async () => {
    const task = { taskType, track, nazemManaged: true };
    assert.equal(canMarkNazemNotCompleted(task), true);
    assert.equal(canMarkNazemNotCompleted({ ...task, nazemManaged: false }), false);
    assert.equal(canMarkNazemNotCompleted({ ...task, nazemSubmissionLocked: true }), false);
    assert.equal(nazemNotCompletedLabel(task), label);
    const mapped = mapRuwasiRecitationToNazem({ ...task, teacherCompleted: false, evaluationScore: 0, sessionDate: '2026-09-09', attendanceStatus: 'present' });
    Object.assign(mapped, { fromSurahId: 1, fromAyah: 1, scheduledToSurahId: 1, scheduledToAyah: 7 });
    assert.equal(mapped.remoteType, remoteType);
    assert.equal(mapped.completed, false);
    assert.equal(mapped.score, 0);
    const adapter = new NazemAdapter({});
    adapter.resolveRecitationFollowUp = async () => ({ item: {}, payload: {}, day: { id: 123, surah_from: 1, verse_from: 1, surah_to: 1, verse_to: 7 }, followUpDate: mapped.date });
    let checks = 0;
    adapter.verifyRecitation = async () => ++checks === 1 ? null : { status: 'not_completed', externalId: '123' };
    const calls = [];
    adapter.postFollowUpApi = async (...args) => { calls.push(args); };
    adapter.openFollowUp = async () => ({});
    const result = await adapter.submitRecitation({}, { nazemPlanId: 87 }, mapped);
    assert.equal(result.status, 'not_completed');
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], '/educational-plans/item-days/123/not-completed');
    assert.equal(Object.hasOwn(calls[0][1], 'actual_end_aya'), false);
  });
}
