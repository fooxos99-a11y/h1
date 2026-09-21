import { getDailyChallengeWeekDay } from '../../shared/daily-challenge.js';
import { getBusinessDate } from '../../shared/business-date.js';

export const getSaudiDate = getBusinessDate;

export const isDailyChallengeAvailable = (settings, date = new Date()) => {
  if (!settings?.dailyChallengeEnabled) return false;
  const days = Array.isArray(settings.dailyChallengeDays)
    ? settings.dailyChallengeDays.map(Number)
    : [];
  return days.includes(getDailyChallengeWeekDay(getSaudiDate(date)));
};
