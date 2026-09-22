import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { secureRandomId, secureRandomInt, secureRandomItem, secureShuffle } from '../shared/secure-random.js';
import { createDailyChallenge, isDailyChallengeCorrect } from '../shared/daily-challenge-engine.js';
import { pickRandomDailyChallengeGame } from '../shared/daily-challenge.js';
import { createSummitGameChallenge } from '../shared/summit-engine.js';
import { buildBoardLetters } from '../src/components/games/letter-hive/letterHiveLogic.js';
import { BOARD_LETTERS } from '../src/components/games/letter-hive/letterHiveData.js';
import { normalizeTeacherPointTypes } from '../shared/teacher-point-types.js';
import { pickRandomMushafEntry } from '../src/lib/randomMushafExcerpt.js';
import { addQuestionToBank, updateQuestionInBank, deleteQuestionFromBank } from '../src/components/games/letter-hive/letterHiveStorage.js';

test('Mushaf secure draws visit every page before restarting without repeating the last page', (t) => {
  t.mock.method(Math, 'random', () => { throw new Error('Insecure randomness must not be used'); });
  let state = { index: -1, visitedIndexes: [] };
  const seen = new Set();
  for (let index = 0; index < 20; index += 1) {
    state = pickRandomMushafEntry(20, state.visitedIndexes, state.index);
    assert.ok(state.index >= 0 && state.index < 20);
    assert.ok(!seen.has(state.index));
    seen.add(state.index);
  }
  assert.notEqual(pickRandomMushafEntry(20, state.visitedIndexes, state.index).index, state.index);
  assert.equal(pickRandomMushafEntry(1, [0], 0).index, 0);
  assert.deepEqual(pickRandomMushafEntry(0), { index: -1, visitedIndexes: [] });
  assert.ok(pickRandomMushafEntry(2, [], -1, () => undefined).index >= 0);
});

test('secure question IDs continue to support editing and deletion', () => {
  const bank = addQuestionToBank({}, { letter: 'د', question: 'question', answer: 'answer' });
  const id = bank['د'][0].id;
  assert.match(id, /^question-[a-f0-9]{32}$/);
  const updated = updateQuestionInBank(bank, id, { letter: 'ت', question: 'updated', answer: 'answer' });
  assert.equal(updated['د'].length, 0);
  assert.equal(updated['ت'][0].id, id);
  assert.equal(deleteQuestionFromBank(updated, id)['ت'].length, 0);
});

test('remaining reported random sources and audit process lookup are hardened', async () => {
  for (const path of [
    '../src/components/games/letter-hive/letterHiveStorage.js',
    '../src/components/portal/MushafRecitationDialog.jsx', '../src/hooks/useGamePresentation.js',
    '../src/lib/randomMushafExcerpt.js', '../src/pages/CategoriesGame.jsx',
    '../src/pages/LetterHiveGame.jsx', '../src/services/gameUsedQuestions.js',
  ]) {
    assert.doesNotMatch(await readFile(new URL(path, import.meta.url), 'utf8'), /Math\.random/);
  }
  const audit = await readFile(new URL('../scripts/isolated-launch-audit.mjs', import.meta.url), 'utf8');
  assert.ok(audit.includes('spawn(String.raw`C:\\Windows\\System32\\taskkill.exe`'));
  assert.doesNotMatch(audit, /spawn\(['"]taskkill['"]/);
  assert.match(audit, /taskkill\.exe`[\s\S]*?shell: false/);
});

test('secure IDs retain their prefix and survive point-type normalization', () => {
  const ids = new Set(Array.from({ length: 200 }, () => secureRandomId('type')));
  assert.equal(ids.size, 200);
  for (const id of ids) {
    assert.match(id, /^type-[a-f0-9]{32}$/);
    assert.equal(normalizeTeacherPointTypes([{ id, label: 'test', points: 1 }])[0].id, id);
  }
});

test('summit, daily selection and letter boards do not depend on Math.random', (t) => {
  t.mock.method(Math, 'random', () => { throw new Error('Insecure randomness must not be used'); });
  const games = ['size_ordering', 'instant_memory'];
  for (let index = 0; index < 50; index += 1) {
    assert.ok(games.includes(pickRandomDailyChallengeGame(games)));
    const cave = createSummitGameChallenge('cave');
    assert.equal(cave.sequence.length, 5);
    assert.equal(new Set(cave.sequence).size, 5);
    assert.ok(cave.sequence.every((cell) => cell >= 0 && cell < 9));
    assert.ok(createSummitGameChallenge('forest').solution.length > 0);
    assert.deepEqual(buildBoardLetters().sort(), [...BOARD_LETTERS].sort());
  }
  assert.equal(pickRandomDailyChallengeGame(games, 0), games[0]);
  assert.equal(pickRandomDailyChallengeGame(games, 0.99), games[1]);
});

test('reported shared engines and dashboard components have no pseudorandom fallback', async () => {
  for (const path of [
    '../shared/daily-challenge.js', '../shared/summit-engine.js', '../shared/login-numbers.js',
    '../src/components/dashboard/StudentsSection.jsx', '../src/components/dashboard/SummitMapEditor.jsx',
    '../src/components/dashboard/TeacherPointTypesSetting.jsx', '../src/components/games/letter-hive/letterHiveLogic.js',
  ]) {
    assert.doesNotMatch(await readFile(new URL(path, import.meta.url), 'utf8'), /Math\.random/);
  }
});

test('secure random integers reject biased samples and validate ranges', (t) => {
  const values = [0xffffffff, 17];
  const random = t.mock.method(globalThis.crypto, 'getRandomValues', (array) => {
    array[0] = values.shift();
    return array;
  });
  assert.equal(secureRandomInt(10), 7);
  assert.equal(random.mock.callCount(), 2);
  for (const invalid of [0, -1, 1.5, NaN, Infinity, 2 ** 32 + 1]) {
    assert.throws(() => secureRandomInt(invalid), RangeError);
  }
});

test('secure shuffle preserves input and handles empty and single-item arrays', () => {
  const source = Object.freeze(['a', 'b', 'c', 'd']);
  assert.deepEqual(secureShuffle(source).sort(), [...source]);
  assert.deepEqual(secureShuffle([]), []);
  assert.deepEqual(secureShuffle(['a']), ['a']);
  assert.equal(secureRandomItem([]), undefined);
  assert.equal(secureRandomItem(['a']), 'a');
  assert.equal(secureRandomInt(1), 0);
});

test('daily challenges preserve answer ranges and scoring without Math.random', (t) => {
  t.mock.method(Math, 'random', () => { throw new Error('Insecure randomness must not be used'); });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const colors = createDailyChallenge('color_difference');
    for (const round of colors.rounds) {
      assert.ok(round.answer >= 0 && round.answer < round.colors.length);
      assert.equal(round.colors.filter((color) => color === round.colors[round.answer]).length, 1);
    }
    assert.ok(isDailyChallengeCorrect('color_difference', colors, { answers: colors.rounds.map((round) => round.answer) }));
    const math = createDailyChallenge('math_problems');
    for (const problem of math.problems) {
      const [left, operator, right] = problem.question.split(' ');
      assert.ok(Number(left) >= 4 && Number(left) <= 21);
      assert.ok(Number(right) >= 2 && Number(right) <= 13);
      assert.equal(problem.answer, operator === '+' ? Number(left) + Number(right) : Number(left) - Number(right));
      assert.ok(problem.options.includes(problem.answer));
    }
    const size = createDailyChallenge('size_ordering');
    assert.ok(isDailyChallengeCorrect('size_ordering', size, { orders: size.rounds.map((round) => round.answer) }));
    const memory = createDailyChallenge('instant_memory');
    assert.deepEqual(new Set(memory.choices.map((item) => item.id)), new Set(memory.answer));
    assert.ok(isDailyChallengeCorrect('instant_memory', memory, { order: memory.answer }));
  }
});

test('daily challenge randomness has no pseudorandom fallback', async () => {
  for (const path of ['../shared/daily-challenge-engine.js', '../shared/secure-random.js']) {
    assert.doesNotMatch(await readFile(new URL(path, import.meta.url), 'utf8'), /Math\.random/);
  }
});
