import test from 'node:test';
import assert from 'node:assert/strict';
import { versionIsOlder, requiredNativeUpdate, resolveNativeUpdateRequirement } from '../shared/native-update.js';
import { nativeUpdatePolicy, createNativeUpdatePolicy } from '../server/services/nativeUpdate.js';

test('native update compares numeric versions without blocking the current version', () => {
  assert.equal(versionIsOlder('1.0.9', '1.0.20'), true);
  assert.equal(versionIsOlder('1.0.20', '1.0.20'), false);
  assert.equal(versionIsOlder('1.0.23', '1.0.20'), false);
  assert.equal(versionIsOlder('', '1.0.20'), false);
});
test('native updates only recognize configured apps and supported platforms', async () => {
  assert.deepEqual(await nativeUpdatePolicy('unknown', 'android'), { available: false });
  assert.deepEqual(await nativeUpdatePolicy('sa.madarij.app', 'web'), { available: false });
  assert.equal((await nativeUpdatePolicy('sa.madarij.app', 'android')).minimumVersion, '1.0.23');
});
test('every public iOS release becomes mandatory without targeting an unpublished version', async () => {
  let time = 0, version = '1.0.15', reads = 0;
  const policy = createNativeUpdatePolicy({ now: () => time, fetchStore: async () => {
    reads++;
    return { ok: true, json: async () => ({ results: [{ bundleId: 'sa.madarij.app', version }] }) };
  } });
  const initial = await policy('sa.madarij.app', 'ios');
  assert.equal(initial.minimumVersion, '1.0.15');
  assert.equal(requiredNativeUpdate({ version: '1.0.15' }, initial), null);
  assert.equal(requiredNativeUpdate({ version: '1.0.16' }, initial), null);
  version = '1.0.16';
  assert.equal((await policy('sa.madarij.app', 'ios')).minimumVersion, '1.0.15');
  assert.equal(reads, 1);
  time = 300000;
  const published = await policy('sa.madarij.app', 'ios');
  assert.equal(published.minimumVersion, '1.0.16');
  assert.equal(requiredNativeUpdate({ version: '1.0.15' }, published), published);
  assert.equal(requiredNativeUpdate({ version: '1.0.16' }, published), null);
});

test('store errors or another app cannot invent a new mandatory release', async () => {
  for (const response of [
    { ok: false },
    { ok: true, json: async () => ({ results: [{ bundleId: 'other', version: '9.0.0' }] }) },
    { ok: true, json: async () => ({ results: [{ bundleId: 'sa.madarij.app', version: 'invalid' }] }) },
    { ok: true, json: async () => ({}) },
  ]) {
    const policy = createNativeUpdatePolicy({ fetchStore: async () => response });
    assert.deepEqual(await policy('sa.madarij.app', 'ios'), { available: false, checked: false });
  }
  const offline = createNativeUpdatePolicy({ fetchStore: async () => { throw Error('offline'); } });
  assert.deepEqual(await offline('sa.madarij.app', 'ios'), { available: false, checked: false });
});

test('Google Play compares build codes even when marketing versions match', () => {
  const policy = { available: true, minimumBuild: 25, url: 'https://play.google.com/store/apps/details?id=sa.madarij.app' };
  assert.equal(requiredNativeUpdate({ version: '1.0.24', build: '24' }, policy), policy);
  for (const build of ['25', '26', '', 'invalid']) assert.equal(requiredNativeUpdate({ build }, policy), null);
  assert.equal(requiredNativeUpdate({ build: '24' }, { ...policy, available: false }), null);
  assert.equal(requiredNativeUpdate({ build: '24' }, { ...policy, url: 'javascript:alert(1)' }), null);
});

test('a previously mandatory update survives restart/offline and clears after updating', () => {
  const saved = { available: true, minimumVersion: '1.0.16', url: 'https://apps.apple.com/sa/app/id6798071538' };
  assert.equal(resolveNativeUpdateRequirement({ version: '1.0.15' }, null, saved), saved);
  assert.equal(resolveNativeUpdateRequirement({ version: '1.0.15' }, { available: false, checked: false }, saved), saved);
  assert.equal(resolveNativeUpdateRequirement({ version: '1.0.16' }, null, saved), null);
  assert.equal(resolveNativeUpdateRequirement({ version: '1.0.15' }, null, null), null);
  assert.equal(resolveNativeUpdateRequirement({ version: '1.0.15' }, { available: false, checked: true }, saved), null);
});
