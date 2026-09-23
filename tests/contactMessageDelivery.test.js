import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverContactMessage } from '../server/services/contactMessageDelivery.js';

const message = { senderRole: null, senderId: null, senderName: 'زائر', subject: 'استفسار عن التسجيل' };
function fixture({ failPush = false, recipients = [{ id: 3, role: 'manager' }, { id: 4, role: 'admin' }] } = {}) {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes('INSERT INTO contact_messages')) return [{ insertId: 15 }];
      if (sql.includes('SELECT s.id')) {
        assert.match(sql, /s.is_active = 1/);
        assert.match(sql, /s.role = 'manager'/);
        assert.match(sql, /s.role = 'admin' AND EXISTS/);
        assert.match(sql, /p.permission_key = 'contactMessages'/);
        return [recipients];
      }
      if (sql.includes('INSERT INTO app_notifications')) return [{ insertId: 20 }];
      if (sql.includes('notification_push_deliveries') && failPush) throw new Error('push queue failed');
      return [{ affectedRows: 1 }];
    },
  };
  return { calls, pool: { getConnection: async () => connection } };
}
test('contact delivery stores guest message and unread management notification atomically', async () => {
  const { pool, calls } = fixture();
  assert.equal(await deliverContactMessage(pool, message), 15);
  assert.deepEqual(calls.find(call => call.sql?.includes('INSERT INTO contact_messages')).values, [null, null, 'زائر', message.subject]);
  assert.deepEqual(calls.find(call => call.sql?.includes('INSERT INTO app_notification_recipients')).values, [[[20, 'manager', 3], [20, 'admin', 4]]]);
  assert.ok(!calls.find(call => call.sql?.includes('INSERT INTO app_notifications')).values.includes(message.subject));
  assert.deepEqual(calls.slice(-2), ['commit', 'release']);
});
test('notification failure rolls back the message instead of falsely reporting successful delivery', async () => {
  const { pool, calls } = fixture({ failPush: true });
  await assert.rejects(deliverContactMessage(pool, message), /push queue failed/);
  assert.equal(calls.includes('commit'), false);
  assert.deepEqual(calls.slice(-2), ['rollback', 'release']);
});
test('message is retained if no active permitted management account exists', async () => {
  const { pool, calls } = fixture({ recipients: [] });
  assert.equal(await deliverContactMessage(pool, message), 15);
  assert.equal(calls.some(call => call.sql?.includes('INSERT INTO app_notifications')), false);
  assert.deepEqual(calls.slice(-2), ['commit', 'release']);
});
