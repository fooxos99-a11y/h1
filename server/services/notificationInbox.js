// Legacy operational alerts are kept in the database, outside the user inbox.
export const nazemSyncNotificationTitles = [
  'تأخر تحديث ناظم',
  'تنبيه مزامنة ناظم',
  'مزامنة ناظم مكتملة جزئيًا',
];

export const notificationInboxFilter = {
  sql: `(COALESCE(n.dedupe_key, '') NOT LIKE ? AND NOT (
    n.dedupe_key IS NULL AND (${nazemSyncNotificationTitles.map(() => 'n.title LIKE ?').join(' OR ')})
  ))`,
  values: ['nazem:%', ...nazemSyncNotificationTitles.map((title) => `${title}%`)],
};
