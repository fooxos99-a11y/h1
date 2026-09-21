import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getRewardUnits, localizeRewardText } from '../shared/reward-units.js';

test('reward terminology defaults to points and switches only when the map is enabled', async () => {
  const [hook, settings] = await Promise.all([
    readFile(new URL('../src/hooks/useRewardUnits.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/SettingsSection.jsx', import.meta.url), 'utf8'),
  ]);
  assert.equal(getRewardUnits(false).format(1), '١ نقطة');
  assert.equal(getRewardUnits(false).format(20), '٢٠ نقطة');
  assert.equal(getRewardUnits(true).format(20), '٢٠ كم');
  assert.equal(localizeRewardText('إضافة 20 كم', false), 'إضافة 20 نقطة');
  assert.equal(localizeRewardText('إضافة 20 نقطة', true), 'إضافة 20 كيلومتر');
  assert.match(hook, /madarij-settings-updated/);
  assert.match(settings, /useRewardUnits\(settings\.summitEnabled\)/);
  assert.match(settings, /writePublicSettingsCache\(saved\)/);
});
