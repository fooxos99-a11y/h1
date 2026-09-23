export const UNDO_WINDOW_MS = 10_000;
export const ACTION_CANCELLED_MESSAGE = 'تم التراجع عن الأمر';
export const isActionCancelled = (error) => error?.code === 'ACTION_CANCELLED';

export function createDeferredActions({ now = Date.now, schedule = setTimeout, clear = clearTimeout } = {}) {
  const pending = new Map();
  const listeners = new Set();
  let snapshot = [];
  let sequence = 0;
  const publish = () => {
    snapshot = [...pending.values()].map(({ id, label, expiresAt }) => ({ id, label, expiresAt }));
    listeners.forEach(listener => listener());
  };
  const settle = (id, cancelled) => {
    const item = pending.get(id);
    if (!item) return;
    clear(item.timer);
    item.signal?.removeEventListener('abort', item.abort);
    pending.delete(id);
    publish();
    if (cancelled) {
      const error = new Error(ACTION_CANCELLED_MESSAGE);
      error.code = 'ACTION_CANCELLED';
      item.reject(error);
    } else item.resolve();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    cancel: id => settle(id, true),
    cancelAll: () => [...pending.keys()].forEach(id => settle(id, true)),
    wait(label, signal) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const abort = () => settle(id, true);
        const timer = schedule(() => settle(id, false), UNDO_WINDOW_MS);
        pending.set(id, { id, label, expiresAt: now() + UNDO_WINDOW_MS, timer, signal, abort, resolve, reject });
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
        else publish();
      });
    },
  };
}

export const deferredActions = createDeferredActions();
let dashboardActive = false;
export function enableDashboardUndo(active) {
  dashboardActive = active;
  if (!active) deferredActions.cancelAll();
}
export async function waitForDashboardUndo(label, signal) {
  const actionLabel = label === undefined ? 'حفظ التغييرات' : label;
  if (dashboardActive) await deferredActions.wait(actionLabel, signal);
}

export function isDeferredMutation(path, options = {}) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(options.method || 'GET').toUpperCase())) return false;
  const route = path.split('?')[0];
  if (['/auth/', '/notifications/', '/student-notifications/', '/offline-recitation/', '/offline-student/']
    .some(prefix => route.startsWith(prefix))) return false;
  if (route.endsWith('/token') || route.endsWith('/leave') || route.endsWith('/range')) return false;
  // Already committed offline operations passed the undo window before being stored.
  if (typeof options.body === 'string') {
    try { if (JSON.parse(options.body)?.committedAtLocal) return false; } catch { /* Non-JSON bodies remain eligible. */ }
  }
  return true;
}
