import { randomInt } from 'node:crypto';

export function selectRandomItems(items, count) {
  const pool = [...items];
  const limit = Math.min(pool.length, Math.max(0, Math.trunc(count) || 0));
  for (let index = 0; index < limit; index += 1) {
    const selected = randomInt(index, pool.length);
    [pool[index], pool[selected]] = [pool[selected], pool[index]];
  }
  return pool.slice(0, limit);
}
