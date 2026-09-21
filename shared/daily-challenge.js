export const DAILY_CHALLENGE_GAMES = Object.freeze([
  { value: 'size_ordering', label: 'ترتيب الأحجام' },
  { value: 'color_difference', label: 'اللون المختلف' },
  { value: 'math_problems', label: 'حل المسائل' },
  { value: 'instant_memory', label: 'الذاكرة اللحظية' },
  { value: 'summit_forest', label: 'مسار الغابة' },
  { value: 'summit_cave', label: 'تذكر الأضواء' },
]);

export const SUMMIT_DAILY_CHALLENGE_GAME_TYPES = Object.freeze(
  DAILY_CHALLENGE_GAMES.map(({ value }) => value).filter((value) => value.startsWith('summit_')),
);

export const DAILY_CHALLENGE_GAME_TYPES = Object.freeze(DAILY_CHALLENGE_GAMES.map(({ value }) => value));
export const ALL_WEEK_DAYS = Object.freeze([0, 1, 2, 3, 4, 5, 6]);
export const DAILY_CHALLENGE_WEEK_DAYS = Object.freeze([
  { value: 0, label: 'الأحد' },
  { value: 1, label: 'الاثنين' },
  { value: 2, label: 'الثلاثاء' },
  { value: 3, label: 'الأربعاء' },
  { value: 4, label: 'الخميس' },
  { value: 5, label: 'الجمعة' },
  { value: 6, label: 'السبت' },
]);

export function normalizeDailyChallengeGames(value, fallback = DAILY_CHALLENGE_GAME_TYPES) {
  const source = Array.isArray(value) ? value : [];
  const normalized = DAILY_CHALLENGE_GAME_TYPES.filter((type) => source.includes(type));
  return normalized.length ? normalized : [...fallback];
}

export function normalizeDailyChallengeDays(value, fallback = ALL_WEEK_DAYS) {
  const source = Array.isArray(value) ? value.map(Number) : [];
  const normalized = ALL_WEEK_DAYS.filter((day) => source.includes(day));
  return normalized.length ? normalized : [...fallback];
}

export function getDailyChallengeWeekDay(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function pickRandomDailyChallengeGame(enabledGames, randomValue = Math.random()) {
  const games = normalizeDailyChallengeGames(enabledGames);
  const safeRandom = Number.isFinite(randomValue) ? Math.max(0, Math.min(0.999999, randomValue)) : 0;
  return games[Math.floor(safeRandom * games.length)];
}

export function getDailyChallengeGame(date, enabledGames) {
  const games = normalizeDailyChallengeGames(enabledGames);
  const dayIndex = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  return games[Math.abs(dayIndex) % games.length];
}
