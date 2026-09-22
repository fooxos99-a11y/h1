export function selectNazemFollowUpItem(items, type, { sourceDayId, sourceItemId, confirmedRecordIds = [] } = {}) {
  const candidates = items.filter(item => item.type === type);
  if (sourceItemId) return candidates.find(item => String(item.id) === String(sourceItemId));
  const identified = sourceDayId && candidates.find(item => [item.today?.id, item.pending_day?.id]
    .some(id => String(id || '') === String(sourceDayId)));
  if (identified) return identified;
  const active = candidates.find(item => item.is_active === true || item.status === 'active');
  if (active) return active;
  const confirmed = new Set(confirmedRecordIds.map(String));
  const matches = candidates.filter(item => confirmed.has(String(item.today?.id)));
  return matches.length === 1 ? matches[0] : candidates[0];
}

export async function loadConfirmedNazemRecordIds(connection, link) {
  const [rows] = await connection.query(
    `SELECT receipt.remote_snapshot AS snapshot
     FROM nazem_recitation_links receipt
     JOIN student_quran_recitation_attempts attempt ON attempt.id = receipt.ruwasi_recitation_id
     JOIN student_quran_tasks task ON task.id = attempt.task_id
     WHERE receipt.teacher_id = ? AND task.student_id = ? AND task.plan_id = ?
       AND receipt.sync_status = 'synced' AND attempt.is_official = 1
     ORDER BY attempt.id DESC LIMIT 100`, [link.teacherId, link.studentId, link.planId],
  );
  return rows.map(row => typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot)
    .map(snapshot => snapshot?.externalId).filter(id => /^\d+$/.test(String(id || ''))).map(String);
}

export function recitationIdentityFromReceipt(day, recitations, previous) {
  const matched = recitations.length > 0 && recitations.every(attempt => {
    const receipt = typeof attempt.deliverySnapshot === 'string' ? JSON.parse(attempt.deliverySnapshot) : attempt.deliverySnapshot;
    return attempt.deliveryStatus === 'synced' && String(receipt?.externalId || '') === String(day.id);
  });
  return matched ? { ...previous, nazemSourceDayId: day.id, nazemSavedTarget: day } : previous;
}
