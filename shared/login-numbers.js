import { secureRandomItem } from './secure-random.js';

export function generateThreeDigitLoginNumber(usedLoginNumbers) {
  const available = [];
  for (let number = 100; number <= 999; number += 1) {
    const value = String(number);
    if (!usedLoginNumbers.has(value)) available.push(value);
  }
  if (!available.length) return '';
  const value = secureRandomItem(available);
  usedLoginNumbers.add(value);
  return value;
}
