const MAX_VISIBLE_REFRESH_MS = 120_000;

export function nazemStudentRefreshState({ managed, studentId, hasTasks, finished, refresh, now = Date.now() }) {
  if (!managed || hasTasks || finished) return { amountRefreshPending: false, amountRefreshFailed: false, amountRefreshDelayed: false };
  let progress = refresh?.payload || {};
  if (typeof progress === 'string') {
    try { progress = JSON.parse(progress); } catch { progress = {}; }
  }
  const checked = (progress.checkedStudentIds || []).some(id => Number(id) === Number(studentId));
  const waiting = ['pending', 'retrying', 'syncing'].includes(refresh?.status);
  const expired = waiting && now - Number(refresh?.createdEpochMs || 0) > MAX_VISIBLE_REFRESH_MS;
  return {
    amountRefreshPending: waiting && !checked && !expired,
    amountRefreshFailed: !checked && ['failed', 'blocked', 'requires_review', 'conflict'].includes(refresh?.status),
    amountRefreshDelayed: !checked && expired,
  };
}

export async function recordNazemStudentRefresh(connection, job, checkedStudentIds) {
  await connection.query(
    `UPDATE nazem_sync_jobs SET payload_json = JSON_SET(COALESCE(payload_json, JSON_OBJECT()),
      '$.checkedStudentIds', CAST(? AS JSON))
     WHERE id = ? AND status = 'syncing' AND lease_owner = ?`,
    [JSON.stringify([...new Set(checkedStudentIds)]), job.id, job.leaseOwner],
  );
}
