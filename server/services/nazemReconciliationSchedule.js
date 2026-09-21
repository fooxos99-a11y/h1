import { getBusinessDateTimeParts, shiftDateOnly } from '../../shared/business-date.js';

// Return all due phases, not only the current minute, so restarts cannot lose a run.
export function dueNazemReconciliationPhases(now = new Date(), startDate = '') {
  const { date, time } = getBusinessDateTimeParts(now);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return [];
  const phases = [];
  if (time >= '02:00:00' && time < '03:00:00') phases.push({ date, phase: 'nightly' });
  if (time >= '02:45:00' && time < '03:00:00') phases.push({ date, phase: 'retry' });
  const closedDate = shiftDateOnly(date, -1);
  if (time >= '03:05:00' || time < '03:00:00') {
    for (let daysAgo = 0; daysAgo < 7; daysAgo++) {
      const catchUpDate = shiftDateOnly(closedDate, -daysAgo);
      phases.push({ date: catchUpDate, phase: 'nightly' }, { date: catchUpDate, phase: 'retry' }, { date: catchUpDate, phase: 'closing' });
    }
  }
  return phases.filter((item) => item.date >= startDate);
}
