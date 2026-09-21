export const NAZEM_LINK_COUNT_MAX = 40;

export function isValidNazemLinkCount(value) {
  const count = Number(value);
  return Number.isInteger(count) && count >= 0 && count <= NAZEM_LINK_COUNT_MAX;
}

export function normalizeNazemLinkCount(value, fallback = 0) {
  const candidate = Number(value);
  if (Number.isInteger(candidate)) {
    return Math.min(NAZEM_LINK_COUNT_MAX, Math.max(0, candidate));
  }
  const fallbackValue = Number(fallback);
  return Number.isInteger(fallbackValue)
    ? Math.min(NAZEM_LINK_COUNT_MAX, Math.max(0, fallbackValue))
    : 0;
}
