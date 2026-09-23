import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeferredActions, isActionCancelled, isDeferredMutation, UNDO_WINDOW_MS } from '../src/lib/deferredActions.js';

function fixture() {
  const timers = new Map();
  let sequence = 0;
  return { timers, queue: createDeferredActions({
    now: () => 100,
    schedule: (callback, ms) => { assert.equal(ms, UNDO_WINDOW_MS); timers.set(++sequence, callback); return sequence; },
    clear: id => timers.delete(id),
  }) };
}
test('undo prevents execution and later timeout cannot execute a cancelled action', async () => {
  const { queue, timers } = fixture();
  let writes = 0;
  const action = queue.wait('حذف').then(() => writes++);
  const timeout = timers.get(1);
  assert.equal(queue.getSnapshot()[0].expiresAt, 10_100);
  queue.cancel(1);
  await assert.rejects(action, isActionCancelled);
  timeout();
  assert.equal(writes, 0);
  assert.equal(queue.getSnapshot().length, 0);
});
test('each action has its own undo window and executes only once after expiry', async () => {
  const { queue, timers } = fixture();
  let writes = 0;
  const first = queue.wait('حفظ').then(() => writes++);
  const second = queue.wait('حذف');
  const timeout = timers.get(1);
  queue.cancel(2);
  await assert.rejects(second, isActionCancelled);
  assert.equal(writes, 0);
  timeout(); timeout();
  await first;
  assert.equal(writes, 1);
  assert.equal(timers.size, 0);
});
test('abort and leaving the dashboard cancel pending commands', async () => {
  const { queue, timers } = fixture();
  const controller = new AbortController();
  const first = queue.wait('حفظ', controller.signal);
  controller.abort();
  await assert.rejects(first, isActionCancelled);
  const second = queue.wait('حذف');
  queue.cancelAll();
  await assert.rejects(second, isActionCancelled);
  assert.equal(timers.size, 0);
});
test('business writes are delayed but reads, session traffic and offline replay are not', () => {
  for (const path of ['/students/1', '/programs/1/grades', '/notification-management', '/nazem/jobs/1/retry']) {
    assert.equal(isDeferredMutation(path, { method: 'POST' }), true);
    assert.equal(isDeferredMutation(path), false);
  }
  for (const path of ['/auth/logout', '/notifications/devices', '/notifications/1/read', '/calls/1/token', '/offline-recitation/batch']) {
    assert.equal(isDeferredMutation(path, { method: 'POST' }), false);
  }
  assert.equal(isDeferredMutation('/students/1/attendance', { method: 'POST', body: JSON.stringify({ committedAtLocal: '2026-09-23' }) }), false);
});
