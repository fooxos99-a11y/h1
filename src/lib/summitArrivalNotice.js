const shown = new Set();

export function claimSummitArrival(scope, stage, storage) {
  if (!scope || !stage) return false;
  const key = `summit-arrival-v1:${scope}:${stage.id ?? stage.points}:${stage.notificationText || ''}`;
  if (shown.has(key)) return false;
  try {
    const target = storage ?? globalThis.localStorage;
    if (target?.getItem(key)) return false;
    target?.setItem(key, '1');
  } catch {
    // Still suppress repeated notices during this session if storage is unavailable.
  }
  shown.add(key);
  return true;
}
