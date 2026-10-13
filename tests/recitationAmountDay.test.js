import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getRecitationAmountDayOffset,
  normalizeRecitationAmountDay,
} from '../shared/recitation-amount-day.js';

test('recitation amounts default to today and respect an explicit previous-day setting', () => {
  assert.equal(normalizeRecitationAmountDay(undefined), 'same_day');
  assert.equal(normalizeRecitationAmountDay('invalid'), 'same_day');
  assert.equal(getRecitationAmountDayOffset('previous_day'), -1);
});

test('same-day recitation amounts include the session day', () => {
  assert.equal(normalizeRecitationAmountDay('same_day'), 'same_day');
  assert.equal(getRecitationAmountDayOffset('same_day'), 0);
});
