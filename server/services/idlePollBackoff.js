export function createIdlePollBackoff({ now = Date.now, baseMs = 1_000, maxMs = 30_000 } = {}) {
  const entries = new Map();
  return {
    ready: (key) => (entries.get(key)?.nextAt || 0) <= now(),
    record(key, hadWork) {
      const delay = hadWork ? baseMs : Math.min(maxMs, (entries.get(key)?.delay || baseMs) * 2);
      entries.set(key, { delay, nextAt: now() + delay });
    },
  };
}
