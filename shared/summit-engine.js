import {
  SUMMIT_CHALLENGE_MAX_REWARD,
  getSummitStage,
  normalizeSummitChallengeType,
  normalizeSummitStageChallenges,
} from './summit.js';

import { secureRandomItem as randomItem, secureShuffle as shuffled } from './secure-random.js';

const FOREST_GAP_X_VALUES = [20, 32, 44, 56, 68, 80];
const FOREST_WALL_Y_VALUES = [80, 60, 40, 20];

const forestWall = (y, gapX) => [8, 20, 32, 44, 56, 68, 80, 92]
  .filter((x) => x !== gapX)
  .map((x) => ({ x, y, r: 4.6 }));

const createForestGaps = () => FOREST_WALL_Y_VALUES.reduce((gaps, _y, index) => {
  const previousGap = gaps[index - 1];
  const options = previousGap === undefined
    ? FOREST_GAP_X_VALUES
    : FOREST_GAP_X_VALUES.filter((x) => Math.abs(x - previousGap) >= 24);
  gaps.push(randomItem(options));
  return gaps;
}, []);

const createForestMaze = () => {
  const gaps = createForestGaps();
  const start = [10, 94];
  const goal = [90, 6];
  return {
    type: 'forest',
    start,
    goal,
    playerRadius: 2.6,
    stones: FOREST_WALL_Y_VALUES.flatMap((y, index) => forestWall(y, gaps[index])),
    solution: [
      start,
      ...FOREST_WALL_Y_VALUES.flatMap((y, index) => [
        [gaps[index], y + 8],
        [gaps[index], y - 8],
      ]),
      goal,
    ],
  };
};

export function createSummitGameChallenge(type) {
  if (type === 'forest') return createForestMaze();
  if (type === 'cave') {
    const sequence = shuffled([0, 1, 2, 3, 4, 5, 6, 7, 8]).slice(0, 5);
    return { type, cells: 9, sequence };
  }
  return null;
}

export function createSummitChallenge(stagePoints, challengeType) {
  const points = Number(stagePoints);
  if (!Number.isFinite(points) || points < 0 || points > 100000) return null;
  const stage = getSummitStage(stagePoints);
  if (!stage) {
    const type = normalizeSummitChallengeType(challengeType).replace(/^summit_/, '');
    return createSummitGameChallenge(type) || createSummitGameChallenge('forest');
  }
  const configuredType = normalizeSummitStageChallenges({ [stage.points]: challengeType })[stage.points];
  return createSummitGameChallenge(configuredType.replace(/^summit_/, ''));
}

export function sanitizeSummitChallenge(challenge) {
  if (!challenge) return null;
  const publicChallenge = { ...challenge };
  delete publicChallenge.solution;
  if (challenge.type === 'cave') publicChallenge.previewSequence = challenge.sequence;
  return publicChallenge;
}

const sameArray = (first = [], second = []) => first.length === second.length
  && first.every((value, index) => value === second[index]);

const pointDistance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);

const isForestTraceValid = (challenge, answer) => {
  const trace = Array.isArray(answer.trace)
    ? answer.trace.slice(0, 2000).map((point) => ({ x: Number(point.x ?? point[0]), y: Number(point.y ?? point[1]) }))
    : [];
  if (trace.length < 2 || trace.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return false;
  const playerRadius = Number(challenge.playerRadius || 3);
  const start = { x: challenge.start[0], y: challenge.start[1] };
  const goal = { x: challenge.goal[0], y: challenge.goal[1] };
  if (pointDistance(trace[0], start) > playerRadius + 1 || pointDistance(trace.at(-1), goal) > 7) return false;

  return trace.every((point, index) => {
    if (index === 0) return true;
    const previous = trace[index - 1];
    const length = pointDistance(previous, point);
    const samples = Math.max(1, Math.ceil(length));
    return Array.from({ length: samples }, (_, sampleIndex) => {
      const progress = (sampleIndex + 1) / samples;
      return {
        x: previous.x + ((point.x - previous.x) * progress),
        y: previous.y + ((point.y - previous.y) * progress),
      };
    }).every((sample) => (
      sample.x >= playerRadius
      && sample.x <= 100 - playerRadius
      && sample.y >= playerRadius
      && sample.y <= 100 - playerRadius
      && challenge.stones.every((stone) => pointDistance(sample, stone) > Number(stone.r) + playerRadius)
    ));
  });
};

const gradeChallenge = (challenge, answer = {}) => {
  if (challenge.type === 'forest') {
    const completed = isForestTraceValid(challenge, answer);
    return { completed, accuracy: completed ? 1 : 0, errors: completed ? 0 : 1 };
  }
  if (challenge.type === 'cave') {
    const selected = Array.isArray(answer.selected) ? answer.selected.map(Number) : [];
    const correctCount = selected.filter((value, index) => value === challenge.sequence[index]).length;
    return { completed: sameArray(selected, challenge.sequence), accuracy: correctCount / challenge.sequence.length, errors: selected.length - correctCount };
  }
  return { completed: false, accuracy: 0, errors: 1 };
};

export function scoreSummitChallenge(challenge, answer, elapsedSeconds, durationSeconds) {
  const result = gradeChallenge(challenge, answer);
  if (!result.completed) return { ...result, reward: 0 };
  const duration = Math.max(1, Number(durationSeconds || 30));
  const speed = Math.max(0, Math.min(1, 1 - (Number(elapsedSeconds || duration) / duration)));
  const reward = Math.min(SUMMIT_CHALLENGE_MAX_REWARD, Math.round(18 + (result.accuracy * 20) + (speed * 12)));
  return { ...result, reward };
}
