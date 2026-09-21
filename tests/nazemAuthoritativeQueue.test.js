import test from 'node:test';
import assert from 'node:assert/strict';
import { selectNazemFirstActionableTasks } from '../server/integrations/nazem/taskSelection.js';

const task = (id, date, type = 'review') => ({ id, studentId: 22, planId: 3,
  taskType: type, track: 'memorization', taskDate: date, nazemManaged: 1 });

test('a submitted earlier amount blocks later amounts until Nazem advances its authoritative date', () => {
  const later = [task(8, '2026-09-08'), task(9, '2026-09-09')];
  const authority = { ...task(7, '2026-09-07'), linkDate: '2026-09-07' };
  assert.deepEqual(selectNazemFirstActionableTasks(later, [authority]), []);
  assert.deepEqual(selectNazemFirstActionableTasks(later, [{ ...authority, taskDate: '2026-09-08' }]).map(t => t.id), [8]);
  assert.deepEqual(selectNazemFirstActionableTasks(later, [{ ...authority, taskDate: null }]), []);
});

test('link follows its memorization date independently from a review date', () => {
  const rows = [task(1, '2026-09-09', 'memorization'), task(2, '2026-09-09', 'link'), task(3, '2026-09-08')];
  const authorities = [{ ...rows[0], linkDate: '2026-09-09' }, rows[2]];
  assert.deepEqual(selectNazemFirstActionableTasks(rows, authorities).map(t => t.id), [1, 2, 3]);
});
