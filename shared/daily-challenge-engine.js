import { DAILY_CHALLENGE_GAMES, SUMMIT_DAILY_CHALLENGE_GAME_TYPES } from './daily-challenge.js';
import { createSummitGameChallenge, sanitizeSummitChallenge, scoreSummitChallenge } from './summit-engine.js';
import { secureRandomInt, secureRandomItem as randomItem, secureShuffle as shuffle } from './secure-random.js';

const colors = ['#e4ad38', '#0f6d83', '#e96b67', '#6d5bd0', '#25a18e', '#f28f3b'];
const shapes = ['دائرة', 'مربع', 'مثلث', 'نجمة', 'سداسي', 'مستطيل'];

export const getDailyChallengeGameLabel = (type) => (
  DAILY_CHALLENGE_GAMES.find((game) => game.value === type)?.label || 'التحدي اليومي'
);

export function createDailyChallenge(type) {
  if (SUMMIT_DAILY_CHALLENGE_GAME_TYPES.includes(type)) {
    return createSummitGameChallenge(type.replace('summit_', ''));
  }
  if (type === 'size_ordering') {
    const rounds = Array.from({ length: 5 }, (_, roundIndex) => {
      const count = roundIndex + 3;
      const sizeStep = [26, 20, 16, 13, 11][roundIndex];
      const items = shuffle(Array.from({ length: count }, (_, index) => {
        const size = 140 - (index * sizeStep);
        return { id: `s${roundIndex}-${index}-${size}`, size, color: randomItem(colors), shape: randomItem(shapes) };
      }));
      return { items, answer: [...items].sort((a, b) => b.size - a.size).map(({ id }) => id) };
    });
    return { rounds };
  }
  if (type === 'color_difference') {
    const rounds = [9, 12, 16, 20, 25].map((count, roundIndex) => {
      const answer = secureRandomInt(count);
      const hue = secureRandomInt(260) + 20;
      const hueDifference = [26, 20, 15, 11, 7][roundIndex];
      return {
        colors: Array.from({ length: count }, (_, index) => `hsl(${hue + (index === answer ? hueDifference : 0)} 68% 54%)`),
        answer,
      };
    });
    return { rounds };
  }
  if (type === 'math_problems') {
    const problems = Array.from({ length: 3 }, (_, index) => {
      const left = 4 + secureRandomInt(18);
      const right = 2 + secureRandomInt(12);
      const operator = index === 1 ? '−' : '+';
      const answer = operator === '+' ? left + right : left - right;
      return { question: `${left} ${operator} ${right}`, options: shuffle([answer, answer + 2, answer - 1, answer + 5]), answer };
    });
    return { problems };
  }
  const items = Array.from({ length: 5 }, (_, index) => {
    const color = randomItem(colors);
    const shape = randomItem(shapes);
    return { id: `m${index}-${color.slice(1)}-${shape}`, color, shape };
  });
  return { items, choices: shuffle(items), answer: items.map(({ id }) => id) };
}

export function sanitizeDailyChallenge(attempt) {
  if (!attempt) return null;
  const challenge = JSON.parse(attempt.challengeJson || JSON.stringify(attempt.challenge || {}));
  const publicChallenge = SUMMIT_DAILY_CHALLENGE_GAME_TYPES.includes(attempt.gameType)
    ? sanitizeSummitChallenge(challenge)
    : challenge;
  if (['size_ordering', 'color_difference'].includes(attempt.gameType)) {
    if (Array.isArray(publicChallenge.rounds)) publicChallenge.rounds.forEach((round) => delete round.answer);
    else delete publicChallenge.answer;
  }
  if (attempt.gameType === 'math_problems') publicChallenge.problems = publicChallenge.problems.map((problem) => {
    const publicProblem = { ...problem };
    delete publicProblem.answer;
    return publicProblem;
  });
  if (attempt.gameType === 'instant_memory') delete publicChallenge.answer;
  return {
    id: Number(attempt.id),
    date: String(attempt.challengeDate).slice(0, 10),
    gameType: attempt.gameType,
    gameLabel: getDailyChallengeGameLabel(attempt.gameType),
    status: attempt.status,
    pointsAwarded: Number(attempt.pointsAwarded || 0),
    challenge: publicChallenge,
  };
}

export function isDailyChallengeCorrect(type, challenge, body) {
  if (body?.failed === true) return false;
  if (SUMMIT_DAILY_CHALLENGE_GAME_TYPES.includes(type)) {
    return scoreSummitChallenge(challenge, body, 1, 60).completed;
  }
  if (type === 'color_difference') {
    if (!Array.isArray(challenge.rounds)) return Number(body?.index) === Number(challenge.answer);
    return Array.isArray(body?.answers)
      && challenge.rounds.length === body.answers.length
      && challenge.rounds.every((round, index) => Number(body.answers[index]) === Number(round.answer));
  }
  if (type === 'math_problems') {
    return Array.isArray(body?.answers)
      && challenge.problems.every((problem, index) => Number(body.answers[index]) === Number(problem.answer));
  }
  if (type === 'size_ordering' && Array.isArray(challenge.rounds)) {
    return Array.isArray(body?.orders)
      && challenge.rounds.length === body.orders.length
      && challenge.rounds.every((round, roundIndex) => {
        const submittedRound = Array.isArray(body.orders[roundIndex]) ? body.orders[roundIndex].map(String) : [];
        return submittedRound.length === round.answer.length && round.answer.every((id, index) => id === submittedRound[index]);
      });
  }
  const submitted = Array.isArray(body?.order) ? body.order.map(String) : [];
  return submitted.length === challenge.answer.length && challenge.answer.every((id, index) => id === submitted[index]);
}
