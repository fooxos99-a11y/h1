import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { shouldShowRecitationStudent } from '../src/lib/recitationActionState.js';
import { mergeCommittedOfflineEvaluation } from '../src/lib/offlineEvaluationMerge.js';

const student = { studentId: 8, studentName: 'طالب اختفاء النتيجة', attendanceStatus: 'present' };
const task = { id: 1, studentId: 8, planId: 17, taskType: 'memorization', taskDate: '2026-10-15' };
const negative = { taskType: 'memorization', track: 'memorization', teacherCompleted: false, label: 'لم يتم الحفظ' };

test('recorded negative results leave the listening list while the result stays unchanged', () => {
  for (const taskType of ['memorization', 'review', 'link', 'mastery']) {
    const record = { ...student, recitationOutcomes: [{ ...negative, taskType }] };
    assert.equal(shouldShowRecitationStudent(record), false);
    assert.equal(record.recitationOutcomes[0].teacherCompleted, false);
    assert.equal(shouldShowRecitationStudent(record, [{ ...task, taskType: 'review' }]), true);
  }
});

test('finished and locally stored students disappear until they have actionable work', () => {
  for (const saved of [{ recitationFinished: true }, { recitationPending: true }, { recitationSyncFailed: true },
    { nazemRecitationCompleted: true }, { recitationOutcomes: [negative] }]) {
    assert.equal(shouldShowRecitationStudent({ ...student, ...saved }), false);
    assert.equal(shouldShowRecitationStudent({ ...student, ...saved }, [], [], [task]), true);
    assert.equal(shouldShowRecitationStudent({ ...student, ...saved }, [], [], [{ ...task, locallySaved: true }]), false);
  }
  assert.equal(shouldShowRecitationStudent(student), true, 'Missing amounts cannot imply a recorded result');
});

test('a durable negative save disappears immediately and after rehydration', () => {
  const evaluation = { date: task.taskDate, students: [student], tasks: [task], taskQueue: [task] };
  const session = { studentId: 8, status: 'pending', sessionDate: task.taskDate,
    tasks: [{ taskId: 1, planId: 17, taskType: task.taskType, taskDate: task.taskDate, payload: { notMemorized: true } }] };
  for (const row of [session, JSON.parse(JSON.stringify(session))]) {
    const merged = mergeCommittedOfflineEvaluation(evaluation, [row]);
    assert.equal(shouldShowRecitationStudent(merged.students[0], merged.tasks, merged.taskQueue), false);
    assert.equal(merged.students[0].recitationOutcomes[0].teacherCompleted, false);
  }
});

const root = fileURLToPath(new URL('../', import.meta.url));
const compiled = build({ entryPoints: [path.join(root, 'src/components/portal/TeacherRecitationTaskList.jsx')],
  bundle: true, write: false, platform: 'node', format: 'cjs', alias: { '@': path.join(root, 'src') },
  external: ['react', 'react-dom', 'react/jsx-runtime'], loader: { '.css': 'empty' },
});
test('the rendered list omits saved captions and negative outcomes but keeps remaining actions', async () => {
  const module = { exports: {} };
  vm.runInNewContext((await compiled).outputFiles[0].text, { module, exports: module.exports,
    require: createRequire(import.meta.url), console, process, URL, setTimeout, clearTimeout });
  const List = module.exports.default;
  const render = props => renderToStaticMarkup(React.createElement(List, { students: [student],
    onRecite: () => {}, date: task.taskDate, ...props }));
  const recorded = { ...student, recitationOutcomes: [negative] };
  assert.doesNotMatch(render({ students: [recorded] }), /طالب اختفاء النتيجة|لم يتم الحفظ|حُفظت النتيجة/);
  const remaining = render({ students: [recorded], tasks: [{ ...task, taskType: 'review' }] });
  assert.match(remaining, /مراجعة/);
  assert.doesNotMatch(remaining, /لم يتم الحفظ|حُفظت النتيجة|اكتمل التسميع/);
  const compensation = render({ students: [{ ...student, recitationFinished: true }], allowCompensation: true,
    compensationTasks: [{ ...task, taskDate: '2026-10-14' }] });
  assert.match(compensation, /التعويض/);
  assert.doesNotMatch(compensation, /اكتمل التسميع|حُفظت النتيجة|لا يوجد مقدار للتسميع/);
});
