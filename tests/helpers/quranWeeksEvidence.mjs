import assert from 'node:assert/strict';

// Independent page-set oracle for the full-page, forward scenarios in the weeks audit.
export function verifyWeeksEvidence(records) {
  const cursors = new Map();
  for (const record of records) {
    const { scenario, date, skipped } = record;
    const day = Number(date.slice(-2));
    let cursor = cursors.get(scenario) ?? 22;
    if (scenario === 'plan-edit' && day === 15) cursor = 22;
    const saved = new Set(record.previousMemorized);
    const memory = record.assignments.find((row) => row.type === 'memorization').pages;
    if (!skipped) for (const page of memory) saved.add(page);
    const sorted = [...saved].sort((a, b) => a - b);
    const end = scenario === 'finish' ? 26 : scenario === 'plan-edit' ? 90 : 80;
    let next = 22;
    while (saved.has(next) && next <= end) next += 1;
    const expectedLink = next > end ? [] : sorted.filter((page) => page < next).slice(-5);
    const actualLink = record.assignments.find((row) => row.type === 'link').pages;
    assert.deepEqual(actualLink, expectedLink, `${scenario} ${date}: exact linking`);
    const available = sorted.filter((page) => !expectedLink.includes(page));
    const rotated = [...available.filter((page) => page >= cursor), ...available.filter((page) => page < cursor)];
    // Student recordings keep the plan active for review until teacher approval.
    const expectedReview = rotated.slice(0, 5);
    const actualReview = record.assignments.find((row) => row.type === 'review').pages;
    assert.deepEqual(actualReview, [...expectedReview].sort((a, b) => a - b), `${scenario} ${date}: review rotation`);
    if (!skipped && expectedReview.length) cursor = expectedReview.at(-1) + 1;
    cursors.set(scenario, cursor);
  }
  return records.length;
}
