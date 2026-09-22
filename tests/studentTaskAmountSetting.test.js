import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('review and link amount settings are persisted independently', async () => {
  const [database, server, settings] = await Promise.all([
    read('../server/db.js'),
    read('../server/index.js'),
    read('../src/components/dashboard/SettingsSection.jsx'),
  ]);

  assert.match(database, /\('studentReviewAmountEditable', 'true'\)/);
  assert.match(database, /\('studentLinkAmountEditable', 'true'\)/);
  assert.match(server, /studentReviewAmountEditable: settings\.studentReviewAmountEditable !== 'false'/);
  assert.match(server, /studentLinkAmountEditable: req\.body\.studentLinkAmountEditable === undefined[\s\S]*parseBoolean\(req\.body\.studentLinkAmountEditable\)/);
  assert.match(settings, /studentReviewAmountEditable: true/);
  assert.match(settings, /label="السماح للطالب بتعديل مقدار المراجعة"/);
  assert.match(settings, /label="السماح للطالب بتعديل مقدار الربط"/);
});

test('fixed task amount removes student controls and is enforced by the server', async () => {
  const [server, execution, toggle] = await Promise.all([
    read('../server/index.js'),
    read('../src/components/portal/QuranExecutionDialog.jsx'),
    read('../src/components/ui/setting-toggle.jsx'),
  ]);

  assert.match(server, /studentReviewAmountEditable: Boolean\(settings\.studentReviewAmountEditable\)[\s\S]*executionAyahs/);
  assert.match(server, /canStudentSetQuranTaskEnd\(settings, first\.taskType, endComparison\)/);
  assert.match(server, /practiceCompletionCount\(req\.body\.repeatCount, expectedRepeatCount\)/);
  assert.match(execution, /canStudentSetQuranTaskEnd/);
  assert.match(execution, /const canAdjust = options\.some/);
  assert.match(toggle, /description = ''/);
  assert.match(toggle, /text-muted-foreground/);
});
