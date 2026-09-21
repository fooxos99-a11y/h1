import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { URL } from 'node:url';
import { notificationInboxFilter } from '../server/services/notificationInbox.js';
import { nazemEvaluationEndDateSql } from '../server/integrations/nazem/evaluationScope.js';
import { processNotificationPushBatch } from '../server/services/notificationPush.js';

test('queued pushes follow the current manager account and exclude the device previous account', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec(`CREATE TABLE notification_push_deliveries (notification_id, device_id, attempts, user_role, user_id, status, next_attempt_at, error_code);
      CREATE TABLE notification_devices (id, platform, token, session_hash, user_role, user_id);
      CREATE TABLE app_notifications (id, title, body, dedupe_key);
      CREATE TABLE auth_sessions (token_hash, user_role, user_id);
      CREATE TABLE app_notification_recipients (notification_id, user_role, user_id);
      CREATE TABLE students (id);
      CREATE TABLE supervisors (id, role, is_active);
      INSERT INTO students VALUES (4);
      INSERT INTO supervisors VALUES (7,'manager',1);
      INSERT INTO notification_devices VALUES (1,'ios','fixture-token','fixture-session','manager',7);
      INSERT INTO auth_sessions VALUES ('fixture-session','manager',7);
      INSERT INTO app_notifications VALUES (1,'old','old',NULL),(2,'current','current',NULL),(3,'old role','old role',NULL);
      INSERT INTO app_notification_recipients VALUES (1,'student',4),(2,'manager',7),(3,'admin',7);
      INSERT INTO notification_push_deliveries VALUES
        (1,1,0,'student',4,'pending','2020-01-01',NULL),
        (2,1,0,'manager',7,'pending','2020-01-01',NULL),
        (3,1,0,'admin',7,'pending','2020-01-01',NULL);`);
    const sent = [];
    const connection = { release() {}, query: async (sql, values = []) => {
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.includes('RELEASE_LOCK')) return [[]];
      if (sql.startsWith('SELECT')) {
        const [roles, ...rest] = values;
        return [database.prepare(sql.replace('IN (?)', `IN (${roles.map(() => '?').join(',')})`).replaceAll('NOW()', 'CURRENT_TIMESTAMP')).all(...roles, ...rest)];
      }
      return [database.prepare(sql).run(...values)];
    } };
    await processNotificationPushBatch({ getConnection: async () => connection }, {}, async (device) => sent.push(device.id));
    assert.deepEqual(sent, [2]);
    database.exec("UPDATE notification_push_deliveries SET status='pending'; UPDATE supervisors SET role='supervisor'");
    await processNotificationPushBatch({ getConnection: async () => connection }, {}, async (device) => sent.push(device.id));
    assert.deepEqual(sent, [2], 'A changed staff role cannot receive queued messages for the previous role');
  } finally { database.close(); }
});

test('Nazem tasks use session-day cutoff while local plans retain previous-day configuration', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE nazem_plan_links (ruwasi_plan_id, ruwasi_student_id, teacher_id, sync_status);
      CREATE TABLE nazem_accounts (teacher_id, status);
      CREATE TABLE app_settings (setting_key, setting_value);
      CREATE TABLE tasks (id, plan_id, student_id, task_date);
      INSERT INTO nazem_accounts VALUES (4,'connected');
      INSERT INTO app_settings VALUES ('nazemIntegrationEnabled','true');
      INSERT INTO nazem_plan_links VALUES (1,7,4,'synced');
      INSERT INTO tasks VALUES (1,1,7,'2026-09-06'),(2,2,8,'2026-09-06'),(3,2,8,'2026-09-05'),(4,1,7,'2026-09-07');`);
    const query = db.prepare(`SELECT id FROM tasks t WHERE task_date <= ${nazemEvaluationEndDateSql} ORDER BY id`);
    assert.deepEqual(query.all('2026-09-06', '2026-09-05').map((r) => r.id), [1, 3]);
    db.exec("UPDATE nazem_plan_links SET sync_status='detached'");
    assert.deepEqual(query.all('2026-09-06', '2026-09-05').map((r) => r.id), [3]);
  } finally { db.close(); }
});

test('inbox excludes operational Nazem messages but preserves administration broadcasts and other notices', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE app_notifications (id, title, dedupe_key);
      INSERT INTO app_notifications VALUES
        (1,'تأخر تحديث ناظم — معلم',NULL),
        (2,'تنبيه مزامنة ناظم — معلم',NULL),
        (3,'مزامنة ناظم مكتملة جزئيًا — معلم',NULL),
        (4,'تنبيه تقني','nazem:sync:1'),
        (5,'تأخر تحديث ناظم — رسالة إدارة','broadcast:admin:1:2'),
        (6,'خصم نقطة',NULL),(7,'بدأ الاختبار','quran_test_start:1');`);
    const rows = db.prepare(`SELECT id FROM app_notifications n WHERE ${notificationInboxFilter.sql} ORDER BY id`).all(...notificationInboxFilter.values);
    assert.deepEqual(rows.map((r) => r.id), [5, 6, 7]);
  } finally { db.close(); }
});

test('opening the inbox marks only supplied messages belonging to the authenticated role and account', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec(`CREATE TABLE app_notification_recipients (notification_id, user_role, user_id, read_at);
      INSERT INTO app_notification_recipients VALUES (1,'student',7,NULL),(2,'student',8,NULL),
        (3,'supervisor',7,NULL),(4,'student',7,NULL);`);
    const routes = {};
    const router = () => ({ use() {}, get() {}, delete() {}, post(path, handler) { routes[path] = handler; } });
    const source = (await readFile(new URL('../server/routes/notificationRoutes.js', import.meta.url), 'utf8'))
      .replace(/^import .+;\r?$/gm, '').replace(/export const /g, 'const ');
    vm.runInNewContext(source, {
      express: { Router: router }, requirePermission: () => () => {},
      db: () => ({ query: async (sql, values) => {
        const ids = values.at(-1);
        database.prepare(sql.replace('NOW()', 'CURRENT_TIMESTAMP').replace('IN (?)', `IN (${ids.map(() => '?').join(',')})`))
          .run(...values.slice(0, -1), ...ids);
      } }),
    });
    let status = 200;
    const res = { status(value) { status = value; return this; }, json() {} };
    await routes['/read']({ auth: { role: 'student', id: 7 }, body: { ids: [1, 2, 3] } }, res, (error) => { throw error; });
    assert.equal(status, 200);
    assert.deepEqual(database.prepare('SELECT notification_id FROM app_notification_recipients WHERE read_at IS NOT NULL').all().map((r) => r.notification_id), [1]);
    await routes['/read']({ auth: { role: 'student', id: 7 }, body: { ids: ['1 OR 1=1'] } }, res, (error) => { throw error; });
    assert.equal(status, 422);
  } finally { database.close(); }
});
