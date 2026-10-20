import test from 'node:test';
import assert from 'node:assert/strict';
import { packTeacherEvaluation, unpackTeacherEvaluation } from '../shared/teacher-evaluation-transport.js';

test('all task ranges, choices, quantities and historical rows survive wire and offline snapshot round trips', () => {
  const options = [{ page: 10, surah: 2, ayah: 50, reviewFaces: 20 }];
  const task = { id: 1, studentId: 5, taskDate: '2026-10-19', options, normalEnd: options[0], reviewExpectedFaces: 20 };
  const original = { students: [{ studentId: 5 }], tasks: [task], compensationTasks: [{ ...task, id: 2, options: [...options] }], taskQueue: [task] };
  const packed = packTeacherEvaluation(original);
  assert.equal(Object.keys(packed.executionChoices).length, 1);
  assert.equal(packed.tasks[0].options, undefined);
  const restored = unpackTeacherEvaluation(JSON.parse(JSON.stringify(packed)));
  assert.deepEqual(restored, original);
  assert.equal(restored.tasks[0].options, restored.compensationTasks[0].options);
  assert.equal(original.tasks[0].options, options);
});

test('large repeated history is serialized once while all rows remain available', () => {
  const options = Array.from({ length: 1000 }, (_, i) => ({ page: 1, surah: 2, ayah: i + 1 }));
  const original = { taskQueue: Array.from({ length: 100 }, (_, id) => ({ id, options })) };
  const packed = packTeacherEvaluation(original);
  assert.equal(packed.taskQueue.length, 100);
  assert.equal(Object.keys(packed.executionChoices).length, 1);
  assert.ok(JSON.stringify(packed).length < JSON.stringify(original).length / 20);
});

test('choices with the same list but different current ranges stay independent; legacy snapshots still work', () => {
  const options = [{ page: 2, surah: 2, ayah: 1 }];
  const original = { tasks: [{ id: 1, options, reviewActualFaces: 20 }, { id: 2, options, reviewActualFaces: 10 }] };
  assert.equal(Object.keys(packTeacherEvaluation(original).executionChoices).length, 2);
  assert.deepEqual(unpackTeacherEvaluation(packTeacherEvaluation(original)), original);
  assert.equal(unpackTeacherEvaluation(original), original);
  assert.equal(packTeacherEvaluation(null), null);
  assert.throws(() => unpackTeacherEvaluation({ executionChoicesVersion: 1, tasks: [{ executionChoicesKey: '__proto__' }] }), /تعذر/);
});

test('version two interns verse records and names across different choice lists while version one remains supported', () => {
  const first = { page: 2, surah: 2, ayah: 1, surahName: 'البقرة', reviewFaces: 20 };
  const second = { ...first, ayah: 2, reviewFaces: 21 };
  const original = { tasks: [{ id: 1, options: [first, second] }, { id: 2, options: [second] }] };
  const packed = packTeacherEvaluation(original);
  assert.equal(packed.executionChoicesVersion, 2);
  assert.equal(packed.executionOptionTable.length, 2);
  assert.deepEqual(packed.executionOptionStrings, ['البقرة']);
  const decoded = unpackTeacherEvaluation(JSON.parse(JSON.stringify(packed)));
  assert.deepEqual(decoded, original);
  assert.equal(decoded.tasks[0].options[1], decoded.tasks[1].options[0]);
  assert.deepEqual(unpackTeacherEvaluation(packTeacherEvaluation(original, { version: 1 })), original);
  packed.executionChoices.c0.options = [999];
  assert.throws(() => unpackTeacherEvaluation(packed), /تعذر/);
});
