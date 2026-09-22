import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { generateThreeDigitLoginNumber } from '../server/services/loginNumbers.js';
import { selectRandomItems } from '../server/services/randomSelection.js';

test('login number generation covers 200 students and handles an exhausted range', () => {
  const used = new Set();
  for (let index = 0; index < 900; index += 1) {
    const value = generateThreeDigitLoginNumber(used);
    assert.match(value, /^[1-9]\d{2}$/);
    assert.equal(used.size, index + 1);
  }
  assert.equal(generateThreeDigitLoginNumber(used), '');
  used.delete('500');
  assert.equal(generateThreeDigitLoginNumber(used), '500');
});

test('question selection preserves input and returns unique members within the requested limit', () => {
  const items = Object.freeze(['a', 'b', 'c', 'd']);
  for (const count of [0, 1, 3, 4, 10]) {
    const result = selectRandomItems(items, count);
    assert.equal(result.length, Math.min(count, items.length));
    assert.equal(new Set(result).size, result.length);
    assert.ok(result.every((item) => items.includes(item)));
  }
  assert.deepEqual(selectRandomItems([], 5), []);
  assert.deepEqual(selectRandomItems(items, -1), []);
});

test('reported server random sources use cryptographic randomness', async () => {
  const [server, routes, login, selection] = await Promise.all([
    '../server/index.js', '../server/routes/culturalGamesRoutes.js',
    '../server/services/loginNumbers.js', '../server/services/randomSelection.js',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
  assert.match(server, /return crypto\.randomInt\(6000, 10001\)/);
  for (const source of [routes, login, selection]) assert.doesNotMatch(source, /Math\.random\(/);
  assert.match(routes, /selectRandomItems\(pool, maxPerGroup\)/);
});
