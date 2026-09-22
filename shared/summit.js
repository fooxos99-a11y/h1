import { DAILY_CHALLENGE_GAMES } from './daily-challenge.js';

export const SUMMIT_MAX_POINTS = 8000;
export const SUMMIT_CHALLENGE_MAX_REWARD = 50;

export const SUMMIT_MAP_CHALLENGES = Object.freeze(DAILY_CHALLENGE_GAMES.map((game) => ({
  type: game.value,
  title: game.label,
})));

export const SUMMIT_STAGES = Object.freeze([
  { points: 1000, key: 'unaizah', name: 'عنيزة', challenge: 'تحدٍّ متنوع', duration: 45 },
  { points: 2000, key: 'mithnab', name: 'المذنب', challenge: 'تحدٍّ متنوع', duration: 35 },
  { points: 3000, key: 'rass', name: 'الرس', challenge: 'تحدٍّ متنوع', duration: 30 },
  { points: 4000, key: 'badai', name: 'البدائع', challenge: 'تحدٍّ متنوع', duration: 35 },
  { points: 5000, key: 'bukayriyah', name: 'البكيرية', challenge: 'تحدٍّ متنوع', duration: 30 },
  { points: 6000, key: 'uyun-al-jiwa', name: 'عيون الجواء', challenge: 'تحدٍّ متنوع', duration: 30 },
  { points: 7000, key: 'asyah', name: 'الأسياح', challenge: 'تحدٍّ متنوع', duration: 45 },
  { points: 8000, key: 'mystery-goal', name: 'الهدف النهائي', challenge: '', duration: 0 },
]);

export const SUMMIT_DEFAULT_STAGE_CHALLENGES = Object.freeze({
  1000: 'summit_forest',
  2000: 'summit_cave',
  3000: 'summit_forest',
  4000: 'summit_cave',
  5000: 'summit_forest',
  6000: 'summit_cave',
  7000: 'summit_forest',
});

const SUMMIT_CHALLENGE_TYPES = new Set(SUMMIT_MAP_CHALLENGES.map(({ type }) => type));
export const normalizeSummitChallengeType = (value) => {
  const selected = String(value || '');
  if (selected === 'forest') return 'summit_forest';
  if (selected === 'cave') return 'summit_cave';
  return SUMMIT_CHALLENGE_TYPES.has(selected) ? selected : '';
};

export function normalizeSummitStageChallenges(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(SUMMIT_STAGES.slice(0, -1).map(({ points }) => {
    const selected = normalizeSummitChallengeType(source[points]);
    return [String(points), selected || SUMMIT_DEFAULT_STAGE_CHALLENGES[points]];
  }));
}

export const getSummitStage = (points) => SUMMIT_STAGES.find(
  (stage) => stage.points === Number(points),
) || null;

export const getSummitChallengeTitle = (type) => SUMMIT_MAP_CHALLENGES.find(
  (challenge) => challenge.type === normalizeSummitChallengeType(type),
)?.title || '';

export function getSummitProgressSummary(value, stages = SUMMIT_STAGES, maximumPoints = SUMMIT_MAX_POINTS) {
  const normalizedMaximum = Math.max(1, Math.trunc(Number(maximumPoints) || SUMMIT_MAX_POINTS));
  const points = Math.min(normalizedMaximum, Math.max(0, Math.trunc(Number(value || 0))));
  const nextStage = stages.find((stage) => stage.points > points) || null;
  return {
    points,
    percentage: Math.round((points / normalizedMaximum) * 10000) / 100,
    nextStage,
    remaining: nextStage ? nextStage.points - points : 0,
    reachedSummit: points >= normalizedMaximum,
  };
}
