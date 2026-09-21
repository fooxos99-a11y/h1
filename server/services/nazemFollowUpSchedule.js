import { getBusinessDateTimeParts } from '../../shared/business-date.js';

export function nazemFollowUpSlot(now = new Date()) {
  const { date, time } = getBusinessDateTimeParts(now);
  if (!date || time < '04:00:00') return null;
  return { date, hour: time >= '15:00:00' ? 15 : 4 };
}
