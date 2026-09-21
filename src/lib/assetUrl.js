export const resolveAssetUrl = (value) => {
  const source = String(value || '').trim();
  if (!source || /^(?:https?:|data:|blob:)/i.test(source)) {
    return source;
  }
  const base = String(import.meta.env.BASE_URL || '/').replace(/\/+$/, '/');
  const normalizedSource = source.replace(/^\/+/, '');
  if (base !== '/' && source.startsWith(base)) return source;
  return `${base}${normalizedSource}`;
};
