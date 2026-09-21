import test from 'node:test';
import assert from 'node:assert/strict';
import { studentSessionResult } from '../src/lib/studentSessionResult.js';
import { studentLevelStage } from '../src/lib/studentPlanLevel.js';
test('session results have one label without duplicated imported ratings', () => {
 assert.equal(studentSessionResult({ teacherCompleted: false, teacherRatingLabel: 'لم يتم الربط' }).label, 'لم يكمل');
 assert.equal(studentSessionResult({ teacherCompleted: true, teacherRatingLabel: 'متقن' }).label, 'متقن');
 assert.equal(studentSessionResult({ teacherCompleted: true, mistakeCount: 3 }).label, '3 أخطاء');
 assert.equal(studentSessionResult({ teacherCompleted: true, warningCount: 2 }).label, '2 تنبيهات');
 assert.equal(studentSessionResult({ teacherCompleted: false, mistakeCount: 3 }).label, '3 أخطاء');
 assert.equal(studentSessionResult({ teacherCompleted: null }).label, 'بانتظار التقييم');
});
test('level bar advances through ten-level milestones without changing plan completion', () => {
 assert.deepEqual(studentLevelStage({ totalAyahs: 1000, completedAyahs: 20 }), { target: 10, progress: 20 });
 assert.deepEqual(studentLevelStage({ totalAyahs: 1000, completedAyahs: 90 }), { target: 10, progress: 90 });
 assert.deepEqual(studentLevelStage({ totalAyahs: 1000, completedAyahs: 100 }), { target: 20, progress: 0 });
 assert.deepEqual(studentLevelStage({ totalAyahs: 1000, completedAyahs: 1000 }), { target: 100, progress: 100 });
});
