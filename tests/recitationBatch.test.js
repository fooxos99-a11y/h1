import assert from 'node:assert/strict';
import test from 'node:test';
import { processRecitationSessionBatch } from '../server/services/recitationBatch.js';

const session = (id, studentId, committedAtLocal, taskId) => ({
  sessionId: id, studentId, sessionDate: '2026-10-05', committedAtLocal,
  tasks: [{ taskId }],
});

test('same-day earlier memorization is accepted before later work despite reversed random IDs', async () => {
  const earlier = session('ffffffff-0000-4000-8000-000000000001', 21, '2026-10-05T13:52:10.000Z', 10);
  const later = session('00000000-0000-4000-8000-000000000002', 21, '2026-10-05T13:53:10.000Z', 11);
  let earlierAccepted = false;
  const executed = [];
  const results = await processRecitationSessionBatch([later, earlier], async current => {
    executed.push(current.sessionId);
    if (current === earlier) earlierAccepted = true;
    return { sessionId: current.sessionId, result: earlierAccepted ? 'accepted' : 'invalid_sequence', tasks: [] };
  });
  assert.deepEqual(executed, [earlier.sessionId, later.sessionId]);
  assert.deepEqual(results.map(row => row.result), ['accepted', 'accepted']);
});

test('a rejected older session preserves its reason and blocks only the same student', async () => {
  const first = session('a', 21, '2026-10-05T13:52:10.000Z', 10);
  const blocked = session('b', 21, '2026-10-05T13:53:10.000Z', 11);
  const independent = session('c', 20, '2026-10-05T13:54:10.000Z', 12);
  const executed = [];
  const results = await processRecitationSessionBatch([independent, blocked, first], async current => {
    executed.push(current.sessionId);
    return { sessionId: current.sessionId, result: current === first ? 'invalid_sequence' : 'accepted',
      tasks: [{ taskId: current.tasks[0].taskId, message: current === first ? 'يجب إكمال المتأخر الأقدم أولًا.' : '' }] };
  });
  assert.deepEqual(executed, ['a', 'c']);
  assert.equal(results[1].result, 'invalid_sequence');
  assert.equal(results[1].blockedBySessionId, 'a');
  assert.match(results[1].tasks[0].message, /يجب إكمال المتأخر الأقدم/);
  assert.equal(results[1].tasks[0].data, null);
  assert.equal(results[2].result, 'accepted');
});

test('empty blocked session still carries a useful top-level reason without reporting acceptance', async () => {
  const first = session('a', 21, '2026-10-05T13:52:10.000Z', 10);
  const second = { ...session('b', 21, '2026-10-05T13:53:10.000Z', 11), tasks: [] };
  const results = await processRecitationSessionBatch([first, second], async current => ({
    sessionId: current.sessionId, result: 'needs_retry', tasks: [{ message: 'تعذر الاتصال بالخادم.' }],
  }));
  assert.equal(results[1].result, 'invalid_sequence');
  assert.match(results[1].message, /تعذر الاتصال بالخادم/);
  assert.deepEqual(results[1].tasks, []);
});

test('batch size remains bounded and missing input causes no execution', async () => {
  let calls = 0;
  const execute = async current => { calls += 1; return { sessionId: current.sessionId, result: 'accepted', tasks: [] }; };
  assert.deepEqual(await processRecitationSessionBatch(undefined, execute), []);
  const input = Array.from({ length: 101 }, (_, id) => session(String(id), id, '2026-10-05T13:52:10.000Z', id + 1));
  assert.equal((await processRecitationSessionBatch(input, execute)).length, 100);
  assert.equal(calls, 100);
});
