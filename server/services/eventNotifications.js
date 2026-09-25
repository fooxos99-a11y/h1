import { eventNotificationDefinitions, normalizeEventNotifications, formatEventNotification } from '../../shared/event-notifications.js';
export async function loadEventNotifications(connection) {
  const [[row]] = await connection.query("SELECT setting_value AS value FROM app_settings WHERE setting_key = 'eventNotifications'");
  return normalizeEventNotifications(row?.value ? JSON.parse(row.value) : {});
}
export async function emitEventNotification(connection, { type, key, values = {}, recipients, config }) {
  const policy = (config || await loadEventNotifications(connection))[type];
  if (!policy?.enabled) return null;
  if (type === 'storeOrder') {
    if (!policy.administrators.length) return null;
    [recipients] = await connection.query("SELECT id, role FROM supervisors WHERE is_active = 1 AND role IN ('manager', 'admin') AND id IN (?)", [policy.administrators]);
  }
  if (!recipients?.length) return null;
  const [result] = await connection.query(
    "INSERT INTO app_notifications (title, body, dedupe_key, recipient_type, created_by_role, created_by_name) VALUES (?, ?, ?, 'specific', 'system', 'النظام') ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)",
    [eventNotificationDefinitions.find(def => def.key === type).label, formatEventNotification(policy.template, values), 'event:' + type + ':' + key],
  );
  for (const person of recipients) await connection.query('INSERT IGNORE INTO app_notification_recipients (notification_id, user_role, user_id) VALUES (?, ?, ?)', [result.insertId, person.role, person.id]);
  await connection.query(
    'INSERT IGNORE INTO notification_push_deliveries (notification_id, device_id, user_role, user_id) SELECT r.notification_id, d.id, r.user_role, r.user_id FROM app_notification_recipients r JOIN notification_devices d ON d.user_role = r.user_role AND d.user_id = r.user_id WHERE r.notification_id = ?', [result.insertId],
  );
  return result.insertId;
}
export async function notifyStudentsOfEvent(connection, event) {
  const config = event.config || await loadEventNotifications(connection);
  if (!config[event.type]?.enabled) return null;
  const [recipients] = await connection.query("SELECT id, 'student' AS role FROM students");
  return emitEventNotification(connection, { ...event, config, recipients });
}
export async function notifyCityTransition(connection, studentId, previousPoints, nextPoints, settings) {
  if (!settings?.eventNotifications?.city?.enabled || !settings.summitEnabled || nextPoints <= previousPoints) return;
  const cities = [...(settings.summitMapConfig?.cities || [])].sort((a, b) => a.kilometer - b.kilometer);
  const previous = cities.findLast(city => city.kilometer <= previousPoints);
  const current = cities.findLast(city => city.kilometer <= nextPoints);
  if (!current || current.id === previous?.id) return;
  await emitEventNotification(connection, {type:'city', key:studentId + ':' + current.id, values:{city:current.name}, recipients:[{role:'student',id:studentId}],config:settings.eventNotifications});
}
