// Store the message, inbox notification and push deliveries atomically in the current tenant.
export async function deliverContactMessage(pool, { senderRole, senderId, senderName, subject }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query(
      `INSERT INTO contact_messages (sender_role, sender_id, sender_name, subject)
       VALUES (?, ?, ?, ?)`, [senderRole, senderId, senderName, subject],
    );
    const [recipients] = await connection.query(
      `SELECT s.id, s.role FROM supervisors s
       WHERE s.is_active = 1 AND (s.role = 'manager' OR (s.role = 'admin' AND EXISTS (
         SELECT 1 FROM supervisor_dashboard_permissions p
         WHERE p.supervisor_id = s.id AND p.permission_key = 'contactMessages'
       )))`,
    );
    if (recipients.length) {
      const [notification] = await connection.query(
        `INSERT INTO app_notifications
          (title, body, dedupe_key, recipient_type, created_by_role, created_by_id, created_by_name)
         VALUES (?, ?, ?, 'specific', 'system', NULL, ?)`,
        ['رسالة تواصل جديدة', 'وصلت رسالة جديدة. يمكنك الاطلاع عليها في صفحة التواصل بلوحة التحكم.', `contact-message:${result.insertId}`, 'النظام'],
      );
      await connection.query(
        `INSERT INTO app_notification_recipients (notification_id, user_role, user_id) VALUES ?`,
        [recipients.map(person => [notification.insertId, person.role, person.id])],
      );
      await connection.query(
        `INSERT IGNORE INTO notification_push_deliveries (notification_id, device_id, user_role, user_id)
         SELECT r.notification_id, d.id, r.user_role, r.user_id FROM app_notification_recipients r
         JOIN notification_devices d ON d.user_role = r.user_role AND d.user_id = r.user_id
         WHERE r.notification_id = ?`, [notification.insertId],
      );
    }
    await connection.commit();
    return result.insertId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}
