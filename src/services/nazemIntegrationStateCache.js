const cacheKey = 'madarij_nazem_integration_state_v1';
const cacheMaxAgeMs = 12 * 60 * 60 * 1_000;

const getStorage = () => {
  try {
    return globalThis.sessionStorage || null;
  } catch {
    return null;
  }
};

const isFresh = (timestamp) => (
  Number.isFinite(Number(timestamp))
  && Date.now() - Number(timestamp) <= cacheMaxAgeMs
);

export const readNazemIntegrationStateCache = () => {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const cached = JSON.parse(storage.getItem(cacheKey) || 'null');
    if (!cached || typeof cached !== 'object') return null;
    const configIsFresh = cached.config && isFresh(cached.configUpdatedAt);
    const accountsAreFresh = Array.isArray(cached.accounts) && isFresh(cached.accountsUpdatedAt);
    if (!configIsFresh && !accountsAreFresh) {
      storage.removeItem(cacheKey);
      return null;
    }
    return {
      config: configIsFresh ? cached.config : null,
      configUpdatedAt: configIsFresh ? Number(cached.configUpdatedAt) : null,
      accounts: accountsAreFresh ? cached.accounts : null,
      accountsUpdatedAt: accountsAreFresh ? Number(cached.accountsUpdatedAt) : null,
    };
  } catch {
    storage.removeItem(cacheKey);
    return null;
  }
};

export const writeNazemIntegrationStateCache = ({ config, accounts } = {}) => {
  const storage = getStorage();
  if (!storage) return null;
  const current = readNazemIntegrationStateCache() || {};
  const now = Date.now();
  const next = {
    ...current,
    ...(config === undefined ? {} : { config, configUpdatedAt: now }),
    ...(accounts === undefined ? {} : { accounts, accountsUpdatedAt: now }),
  };
  try {
    storage.setItem(cacheKey, JSON.stringify(next));
    return next;
  } catch {
    return current;
  }
};
