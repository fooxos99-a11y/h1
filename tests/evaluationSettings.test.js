import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRecitationRewardSettings } from '../server/services/recitationRewards.js';
import {
  calculateRecitationScore,
  getRecitationEvaluationPolicy,
  resolveRecitationEvaluationUnit,
  updateEvaluationMaxScore,
} from '../shared/evaluation-settings.js';
import { readFile } from 'node:fs/promises';

test('changing the evaluation base score preserves the passing ratio', () => {
  const settings = {
    memorizationHalfFaceEvaluationMaxScore: 100,
    memorizationHalfFaceEvaluationPassingScore: 95,
  };

  assert.deepEqual(
    updateEvaluationMaxScore(settings, 'memorizationHalfFaceEvaluation', 50),
    {
      memorizationHalfFaceEvaluationMaxScore: 50,
      memorizationHalfFaceEvaluationPassingScore: 47.5,
    },
  );
});

test('changing one evaluation amount does not affect another amount', () => {
  const settings = {
    memorizationEvaluationMaxScore: 100,
    memorizationEvaluationPassingScore: 95,
    memorizationHalfFaceEvaluationMaxScore: 50,
    memorizationHalfFaceEvaluationPassingScore: 47.5,
  };

  const updated = updateEvaluationMaxScore(settings, 'memorizationHalfFaceEvaluation', 40);

  assert.equal(updated.memorizationEvaluationMaxScore, 100);
  assert.equal(updated.memorizationEvaluationPassingScore, 95);
  assert.equal(updated.memorizationHalfFaceEvaluationMaxScore, 40);
  assert.equal(updated.memorizationHalfFaceEvaluationPassingScore, 38);
});

test('review mistakes always use the configured deduction regardless of amount', () => {
  const policy = {
    type: 'review',
    unit: 'face',
    maxScore: 100,
    warningDeduction: 1,
    mistakeDeduction: 2,
  };

  assert.equal(calculateRecitationScore(policy, 10, 0, 1), 98);
  assert.equal(calculateRecitationScore(policy, 20, 0, 2), 96);
  for (const faces of [0.25, 0.5, 1, 2, 3, 10, 20, 40]) {
    assert.equal(calculateRecitationScore(policy, faces, 0, 1), 98);
    assert.equal(calculateRecitationScore(policy, faces, 0, 60), 0);
    assert.equal(calculateRecitationScore({ ...policy, mistakeDeduction: 7 }, faces, 0, 2), 86);
    assert.equal(calculateRecitationScore({ ...policy, mistakeDeduction: 0 }, faces, 0, 3), 100);
  }
  // Warnings and other recitation types retain their existing amount policies.
  assert.equal(calculateRecitationScore(policy, 5, 1, 0), 98);
  assert.equal(calculateRecitationScore({ ...policy, type: 'link' }, 5, 1, 1), 94);
  assert.equal(calculateRecitationScore({ ...policy, type: 'memorization' }, 2, 0, 2), 98);
  assert.equal(calculateRecitationScore({ ...policy, type: 'mastery' }, 2, 0, 2), 98);
});

test('recitation scores are always whole numbers', () => {
  const score = calculateRecitationScore({
    type: 'review',
    unit: 'tenFaces',
    maxScore: 100,
    warningDeduction: 1,
    mistakeDeduction: 2,
  }, 3, 1, 1);

  assert.equal(Number.isInteger(score), true);
  assert.equal(score, 95);
  assert.equal(calculateRecitationScore({
    type: 'review',
    unit: 'tenFaces',
    maxScore: 99.6,
    warningDeduction: 0,
    mistakeDeduction: 0,
  }, 10, 0, 0), 100);
});

test('Nazem review imports honor a configured zero mistake deduction', async () => {
  for (const value of [0, 2, 7]) {
    const connection = { query: async () => [[{ setting_key: 'reviewEvaluationMistakeDeduction', setting_value: String(value) }]] };
    const settings = await loadRecitationRewardSettings(connection);
    assert.equal(getRecitationEvaluationPolicy(settings, { taskType: 'review' }).mistakeDeduction, value);
  }
  const settings = await loadRecitationRewardSettings({ query: async () => [[]] });
  assert.equal(getRecitationEvaluationPolicy(settings, { taskType: 'review' }).mistakeDeduction, 2);
});

test('quarter-face memorization and mastery use their own policy', () => {
  assert.equal(resolveRecitationEvaluationUnit('memorization', 0.25, 0.25), 'quarterFace');
  assert.equal(resolveRecitationEvaluationUnit('mastery', 0.5, 0.25), 'quarterFace');
  assert.equal(resolveRecitationEvaluationUnit('memorization', 0.5, 0.5), 'halfFace');
  assert.equal(resolveRecitationEvaluationUnit('mastery', 1, 1), 'face');
  assert.equal(resolveRecitationEvaluationUnit('review', 0.25, 0.25), 'tenFaces');
});

test('quarter-face policies are persisted and exposed in recitation settings', async () => {
  const [server, database, settings, catalog] = await Promise.all([
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/db.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/SettingsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../shared/platform-settings-catalog.js', import.meta.url), 'utf8'),
  ]);

  for (const prefix of ['memorizationQuarterFaceEvaluation', 'masteryQuarterFaceEvaluation']) {
    for (const source of [server, database, settings]) assert.match(source, new RegExp(`${prefix}MaxScore`));
    assert.match(catalog, new RegExp(`evaluationFields\\('${prefix}'`));
  }
  assert.match(settings, /EvaluationUnitSelector value=\{evaluationUnit\} onChange=\{setEvaluationUnit\}/);
  const unitSelector = await readFile(new URL('../src/components/dashboard/EvaluationUnitSelector.jsx', import.meta.url), 'utf8');
  assert.match(unitSelector, /value: 'quarterFace'/);
  assert.match(unitSelector, /onClick=\{\(\) => onChange\(unit.value\)\}/);
  assert.match(server, /return getRecitationEvaluationPolicy\(settings, task\)/);
  const policySource = await readFile(new URL('../shared/evaluation-settings.js', import.meta.url), 'utf8');
  assert.match(policySource, /unit === 'quarterFace'[\s\S]*QuarterFaceEvaluation/);
});

test('review and link settings explain automatic score scaling through an accessible icon', async () => {
  const [settings, help] = await Promise.all([
    readFile(new URL('../src/components/dashboard/SettingsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/EvaluationScalingHelp.jsx', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(settings, /أصل ثابت، والخصم لكل ١٠ أوجه/);
  assert.match(settings, /showsScalingHelp: true/);
  assert.match(settings, /<EvaluationScalingHelp type=\{selectedEvaluationType.key\} \/>/);
  assert.match(help, /AlertCircle/);
  assert.match(help, /aria-label="شرح احتساب درجة المراجعة والربط"/);
  assert.match(help, /يتغير حد النجاح تلقائيًا مع الحفاظ على نسبته/);
  assert.match(help, /فخطأ واحد في ١٠ أوجه يعادل خطأين في ٢٠ وجهًا/);
  assert.match(help, /type === 'review'/);
  assert.match(help, /يُخصم عن كل خطأ مقدار خصم الخطأ المحدد في الإعدادات/);
  assert.match(help, /var\(--font-ui\)/);
});
