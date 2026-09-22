import test from 'node:test';
import assert from 'node:assert/strict';
import { isCurrentNazemSession, preservesPendingNazemLate } from '../server/integrations/nazem/scheduleAuthority.js';
import { validateNazemLateSession } from '../server/services/nazemLateSelection.js';

const task = { id: 1, studentId: 24, planId: 7, nazemManaged: 1, taskType: 'memorization',
  track: 'memorization', taskDate: '2026-09-20' };
const authority = { planId: 7, taskType: 'memorization', track: 'memorization', taskDate: '2026-09-10' };

test('today and linking cannot bypass the oldest pending day; exact replays remain idempotent', () => {
  assert.equal(isCurrentNazemSession([task], [authority]), false);
  assert.equal(isCurrentNazemSession([{ ...task, taskType: 'link' }], [authority]), false);
  assert.equal(isCurrentNazemSession([{ ...task, taskType: 'link' }], [
    { ...authority, sourceDate: task.taskDate, remoteStatus: 'completed' },
  ]), true);
  assert.equal(isCurrentNazemSession([{ ...task, taskDate: authority.taskDate }], [authority]), true);
  assert.equal(isCurrentNazemSession([task], []), false);
  assert.equal(isCurrentNazemSession([{ ...task, sameSession: 1 }], []), true);
  assert.equal(isCurrentNazemSession([{ ...task, nazemManaged: 0 }], []), true);
});

test('review with a changed starting verse is rejected before saving another evaluation', () => {
  const review = { ...task, taskType: 'review', fromSurah: 114, fromAyah: 1, toSurah: 78, toAyah: 40 };
  const current = { ...review, fromAyah: 2 };
  assert.equal(isCurrentNazemSession([review], [current]), false);
  assert.equal(isCurrentNazemSession([current], [current]), true);
});

test('independent linking accepts its own current source day without changing memorization eligibility', () => {
  const link = { ...task, taskType: 'link', taskDate: '2026-09-13' };
  const authorities = [{ ...authority, sourceDate: link.taskDate, remoteStatus: 'pending' }];
  assert.equal(isCurrentNazemSession([link], authorities), true);
  assert.equal(isCurrentNazemSession([{ ...link, taskType: 'memorization' }], authorities), false);
  assert.equal(isCurrentNazemSession([{ ...link, taskDate: '2026-09-14' }], authorities), false);
  assert.equal(isCurrentNazemSession([link], [{ ...authorities[0], planId: 99 }]), false);
});

test('historical not-completed result cannot erase a currently available late completion', () => {
  const late = { nazemLate: true, status: 'pending', nazemQueueDate: '2026-09-22' };
  assert.equal(preservesPendingNazemLate(late, { status: 'not_completed', nazemQueueDate: '2026-09-14' }), true);
  assert.equal(preservesPendingNazemLate(late, { status: 'not_completed', nazemQueueDate: '2026-09-22' }), true);
  assert.equal(preservesPendingNazemLate(late, { status: 'completed_late', nazemQueueDate: '2026-09-22' }), false);
  assert.equal(preservesPendingNazemLate({ ...late, nazemLate: false }, { status: 'not_completed' }), false);
});

test('server validates ordinary Nazem tasks as well as late-only batches without changing any records', async () => {
  let selectedTask = task;
  const connection = { query: async (sql, values) => {
    assert.match(sql.trim(), /^SELECT/);
    if (sql.includes('WHERE t.id IN')) {
      assert.deepEqual(values, ['session', 1, 14]);
      return [[selectedTask]];
    }
    if (sql.includes('AS sameSession')) return [[]];
    assert.match(sql, /nazemActionableDate/);
    assert.deepEqual(values, [14, 24, '2026-09-22']);
    return [[authority]];
  } };
  const session = { sessionId: 'session', studentId: 24, sessionDate: '2026-09-22', tasks: [{ taskId: 1 }] };
  assert.equal(await validateNazemLateSession(connection, session, 14), false);
  selectedTask = { ...task, taskDate: authority.taskDate };
  assert.equal(await validateNazemLateSession(connection, session, 14), true);
});

test('a late-only batch cannot bypass an older pending day even when its late ids form an ordered prefix', async () => {
  const late = { ...task, taskDate: '2026-09-08', nazemLate: 1, availableOn: '2026-09-22', remoteStatus: 'pending',
    fromSurah: 57, fromAyah: 26, toSurah: 57, toAyah: 28, toPage: 539, toSurahAyahCount: 29 };
  let actionableDate = '2026-08-31';
  const connection = { query: async sql => {
    if (sql.includes('WHERE t.id IN')) return [[late]];
    if (sql.includes('AS sameSession')) return [[late]];
    return [[{ ...authority, taskDate: actionableDate }]];
  } };
  const session = { sessionId: 'late-session', studentId: 24, sessionDate: '2026-09-22', tasks: [{ taskId: 1 }] };
  assert.equal(await validateNazemLateSession(connection, session, 14), false);
  actionableDate = late.taskDate;
  assert.equal(await validateNazemLateSession(connection, session, 14), true);
});
