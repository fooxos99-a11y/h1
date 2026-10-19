import { MAX_REVIEW_FACES } from './quran-review-cycle.js';

/** Keep occurrences when a fixed amount wraps over the available memorized pages. */
export function pickReviewPages(availablePages, startPage, count, direction = 1) {
  const step = Number(direction) < 0 ? -1 : 1;
  const sorted = [...new Set([...availablePages].map(Number))]
    .filter(page => Number.isInteger(page) && page >= 1 && page <= 604).sort((a, b) => (a - b) * step);
  const amount = Number(count);
  if (!Number.isFinite(amount) || amount < 0.25 || amount > MAX_REVIEW_FACES) throw new RangeError('مقدار المراجعة غير صالح.');
  if (!sorted.length) return { pages: [], nextReviewPage: startPage, amount: 0 };
  const found = sorted.findIndex(page => step * (page - Number(startPage)) >= 0);
  const offset = found < 0 ? 0 : found;
  const pages = Array.from({ length: Math.ceil(amount) }, (_, index) => sorted[(offset + index) % sorted.length]);
  return { pages, amount, nextReviewPage: sorted[(offset + pages.length) % sorted.length] };
}

/** Database ranges stay unique; targetPages retains repeated occurrence weights. */
export function reviewPageRanges({ pages, amount = pages.length }) {
  const weights = new Map();
  pages.forEach((page, index) => {
    const weight = Math.min(1, Math.max(0, amount - index));
    weights.set(page, (weights.get(page) || 0) + weight);
  });
  const ranges = [];
  for (const page of [...weights.keys()].sort((a, b) => a - b)) {
    const last = ranges.at(-1);
    if (last && page === last.toPage + 1) {
      last.toPage = page;
      last.targetPages += weights.get(page);
    } else ranges.push({ fromPage: page, toPage: page, targetPages: weights.get(page) });
  }
  return ranges;
}
