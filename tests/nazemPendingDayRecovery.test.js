import test from 'node:test';
import assert from 'node:assert/strict';
import { readyPendingDayRecoveryKey, wakeReadyPendingNazemDay } from '../server/integrations/nazem/pendingDayRecovery.js';

const source = { id: 770893, date: '2026-09-20', surah_from: 56, verse_from: 91, surah_to: 55, verse_to: 5 };
const row = { id: 1, teacherCompleted: 1, attemptCompleted: 1,
  payload: { taskDate: source.date, taskType: 'memorization', submissionTarget: { source } },
  remote: { ...source, status: 'pending', nazemPendingDay: true, nazemActionableDate: source.date } };

test('a completed blocked evaluation wakes when its original day becomes actionable, only once', async () => {
  let active = false;
  let writes = 0;
  const copy = structuredClone(row);
  const connection = { query: async (sql, params) => {
    if (sql.startsWith('SELECT id')) return [active ? [{ id: 9 }] : []];
    if (sql.startsWith('SELECT job.id')) return [[copy]];
    assert.match(sql, /status = 'blocked'/);
    copy.payload.pendingDayRecoveryKey = params[0];
    writes++;
    return [{ affectedRows: 1 }];
  } };
  const context = { teacherId: 15, studentId: 79, planId: 56 };
  assert.equal(await wakeReadyPendingNazemDay(connection, context), 1);
  assert.equal(await wakeReadyPendingNazemDay(connection, context), null);
  assert.equal(writes, 1);
  active = true;
  assert.equal(await wakeReadyPendingNazemDay(connection, context), null);
});

test('incomplete, legacy, changed targets and later days never wake automatically', () => {
  const variants = [
    { ...row, teacherCompleted: 0 }, { ...row, attemptCompleted: 0 },
    { ...row, payload: { ...row.payload, submissionTarget: null } },
    { ...row, payload: { ...row.payload, taskType: 'link' } },
    ...[{ id: 100 }, { verse_to: 6 }, { date: '2026-09-21' }, { nazemActionableDate: '2026-09-19' },
      { nazemPendingDay: false }, { status: 'not_completed' }].map(patch => ({ ...row, remote: { ...row.remote, ...patch } })),
  ];
  for (const variant of variants) assert.equal(readyPendingDayRecoveryKey(variant), null);
  assert.ok(readyPendingDayRecoveryKey({ ...row, payload: JSON.stringify(row.payload), remote: JSON.stringify(row.remote) }));
});
