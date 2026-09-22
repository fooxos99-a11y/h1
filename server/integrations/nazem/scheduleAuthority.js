// Delivery identities live in local_snapshot/submissionTarget. A saved result must
// not freeze the independent remote schedule, or hide newly available late work.
export const latestNazemScheduleSql = `IF(
  COALESCE(JSON_UNQUOTE(JSON_EXTRACT(VALUES(remote_snapshot), '$.nazemQueueDate')), '')
    >= COALESCE(JSON_UNQUOTE(JSON_EXTRACT(remote_snapshot, '$.nazemQueueDate')), '')
  AND NOT (COALESCE(JSON_UNQUOTE(JSON_EXTRACT(remote_snapshot, '$.nazemLate')), 'false') = 'true'
    AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(remote_snapshot, '$.status')), '') = 'pending'
    AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(VALUES(remote_snapshot), '$.status')), '') = 'not_completed'
    AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(VALUES(remote_snapshot), '$.nazemQueueDate')), '')
      = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(remote_snapshot, '$.nazemQueueDate')), '')),
  VALUES(remote_snapshot), remote_snapshot)`;

export function preservesPendingNazemLate(snapshot, day) {
  return Boolean(snapshot?.nazemLate && snapshot.status === 'pending'
    && day.status === 'not_completed'
    && String(snapshot.nazemQueueDate || '') >= String(day.nazemQueueDate || ''));
}

export function isCurrentNazemSession(owned, authorities, lateIds = []) {
  const late = new Set(lateIds.map(Number));
  return owned.every(task => {
    if (!Number(task.nazemManaged) || Number(task.sameSession) || late.has(Number(task.id))) return true;
    const taskType = ['link', 'repeat'].includes(task.taskType) ? 'memorization' : task.taskType;
    if (task.taskType === 'link' && authorities.some(row => Number(row.planId) === Number(task.planId)
      && row.taskType === 'memorization' && row.track === task.track
      && row.sourceDate === task.taskDate)) return true;
    const authority = authorities.find(row => Number(row.planId) === Number(task.planId)
      && row.taskType === taskType && row.track === task.track);
    if (!authority?.taskDate || authority.taskDate !== task.taskDate) return false;
    return taskType !== 'review' || ['fromSurah', 'fromAyah', 'toSurah', 'toAyah']
      .every(key => Number(authority[key]) > 0 && Number(authority[key]) === Number(task[key]));
  });
}
