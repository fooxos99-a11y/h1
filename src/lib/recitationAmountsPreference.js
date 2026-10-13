export const recitationAmountsPreferenceKey = (tenant, supervisorId) => {
  const id = Number(supervisorId);
  return Number.isSafeInteger(id) && id > 0
    ? `madarij_recitation_amounts:${JSON.stringify([String(tenant || ''), id])}`
    : null;
};

export const readRecitationAmountsPreference = (key, storage) => {
  if (!key) return false;
  try {
    return (storage ?? globalThis.localStorage).getItem(key) === 'true';
  } catch {
    return false;
  }
};

export const writeRecitationAmountsPreference = (key, visible, storage) => {
  if (!key) return false;
  try {
    (storage ?? globalThis.localStorage).setItem(key, String(visible === true));
    return true;
  } catch {
    return false;
  }
};
