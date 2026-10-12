import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createOtaUpdater } from '../src/services/otaUpdateService.js';
import { validateOtaManifest, verifyOtaEnvelope } from '../src/lib/otaProtocol.js';
import { isNativeInput, nativeFingerprint, normalizeBaseUrl, normalizePublicKey } from '../scripts/ota/config.mjs';
import { checkSigningKey, packageWebBundle, publishPointer, readSignedEnvelope, signEnvelope } from '../scripts/ota/release.mjs';

const keys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const config = {
  enabled: true, appId: 'test.ota.synthetic', runtime: 'a'.repeat(64),
  baseUrl: 'https://updates.example.test', publicKey: keys.publicKey,
};
const release = (overrides = {}) => ({
  schema: 1, appId: config.appId, runtime: config.runtime, action: 'update', issuedAt: Date.now(),
  bundleId: 'b'.repeat(64), checksum: 'b'.repeat(64), signature: sign('sha256', Buffer.from('synthetic-zip'), keys.privateKey).toString('base64'),
  url: `${config.baseUrl}/bundles/${config.runtime}/${'b'.repeat(64)}.zip`, ...overrides,
});

function fixture({ manifest = release(), current = null, blocked = [], downloaded = [], enabled = true, channel = config.runtime, fetchError, downloadError } = {}) {
  const calls = [];
  const data = new Map();
  let envelope = signEnvelope(manifest, keys.privateKey);
  const plugin = {
    getChannel: async () => ({ channel }),
    getCurrentBundle: async () => ({ bundleId: current }),
    getBlockedBundles: async () => ({ bundleIds: blocked }),
    getDownloadedBundles: async () => ({ bundleIds: downloaded }),
    downloadBundle: async (options) => { calls.push(['download', options]); if (downloadError) throw downloadError; },
    setNextBundle: async (options) => { calls.push(['stage', options]); },
    reset: async () => { calls.push(['reset']); },
    reload: async () => { calls.push(['reload']); },
  };
  const updater = createOtaUpdater({
    plugin, config: { ...config, enabled }, storage: { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value) },
    fetchImpl: async (url, options) => {
      calls.push(['fetch', url, options]);
      if (fetchError) throw fetchError;
      return { ok: true, text: async () => JSON.stringify(envelope) };
    },
  });
  return { updater, calls, data, replaceEnvelope: (value) => { envelope = value; } };
}

test('OTA verifies the signed manifest and rejects altered metadata and wrong keys', async () => {
  const manifest = release();
  const envelope = signEnvelope(manifest, keys.privateKey);
  assert.deepEqual(await verifyOtaEnvelope(envelope, keys.publicKey), manifest);
  assert.deepEqual(readSignedEnvelope(envelope, keys.publicKey), manifest);
  envelope.payload = envelope.payload.replace('update', 'pause');
  await assert.rejects(verifyOtaEnvelope(envelope, keys.publicKey), /signature/);
  assert.throws(() => readSignedEnvelope(envelope, keys.publicKey), /Untrusted/);
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  assert.throws(() => checkSigningKey(other.privateKey, config.publicKey), /does not match/);
});

test('OTA rejects another app, native runtime, external URL, checksum, future and stale pointers', () => {
  for (const change of [
    { appId: 'another.app' }, { runtime: 'c'.repeat(64) }, { url: 'https://evil.example/bundle.zip' },
    { checksum: 'c'.repeat(64) }, { issuedAt: Date.now() + 600000 }, { action: 'unknown' },
  ]) assert.throws(() => validateOtaManifest(release(change), config));
  assert.throws(() => validateOtaManifest(release({ issuedAt: 10 }), config, 11));
});

test('OTA downloads a signed bundle and stages it without reloading the running app', async () => {
  const f = fixture();
  assert.equal((await f.updater.check()).status, 'staged');
  assert.deepEqual(f.calls.map(([action]) => action), ['fetch', 'download', 'stage']);
  assert.equal(f.calls[1][1].artifactType, 'zip');
  assert.equal(f.calls[1][1].signature, release().signature);
  assert.equal(f.calls[0][2].credentials, 'omit');
  assert.equal(f.calls[0][2].redirect, 'error');
});

test('OTA keeps the current bundle when network or download verification fails', async () => {
  for (const options of [{ fetchError: new Error('offline') }, { downloadError: new Error('signature mismatch') }]) {
    const f = fixture(options);
    await assert.rejects(f.updater.check());
    assert.ok(!f.calls.some(([action]) => ['stage', 'reset'].includes(action)));
  }
});

test('Mandatory startup updates reload only after a trusted bundle finishes downloading and staging', async () => {
  const f = fixture();
  assert.equal((await f.updater.check({ applyImmediately: true })).status, 'reloading');
  assert.deepEqual(f.calls.map(([action]) => action), ['fetch', 'download', 'stage', 'reload']);
  for (const options of [
    { fetchError: new Error('offline') }, { downloadError: new Error('signature mismatch') },
  ]) {
    const failed = fixture(options);
    await assert.rejects(failed.updater.check({ applyImmediately: true }));
    assert.ok(!failed.calls.some(([action]) => ['stage', 'reload'].includes(action)));
  }
  for (const options of [{ current: release().bundleId }, { blocked: [release().bundleId] }, { manifest: release({ action: 'pause' }) }]) {
    const unchanged = fixture(options);
    await unchanged.updater.check({ applyImmediately: true });
    assert.ok(!unchanged.calls.some(([action]) => action === 'reload'));
  }
});

test('Mandatory builtin rollback reloads an OTA bundle but does not loop on the bundled app', async () => {
  const f = fixture({ current: 'c'.repeat(64), manifest: release({ action: 'builtin' }) });
  assert.equal((await f.updater.check({ applyImmediately: true })).status, 'reloading');
  assert.deepEqual(f.calls.map(([action]) => action), ['fetch', 'reset', 'reload']);
  const builtin = fixture({ manifest: release({ action: 'builtin' }) });
  assert.equal((await builtin.updater.check({ applyImmediately: true })).status, 'builtin-current');
  assert.ok(!builtin.calls.some(([action]) => ['reset', 'reload'].includes(action)));
});

test('OTA disabled and native-incompatible builds do not contact the update server', async () => {
  for (const options of [{ enabled: false }, { channel: 'different-native-runtime' }]) {
    const f = fixture(options);
    await f.updater.check();
    assert.deepEqual(f.calls, []);
  }
});

test('OTA skips bundles blocked after rollback and reuses downloaded verified bundles', async () => {
  const blocked = fixture({ blocked: [release().bundleId] });
  assert.equal((await blocked.updater.check()).status, 'blocked');
  assert.equal(blocked.calls.length, 1);
  const cached = fixture({ downloaded: [release().bundleId] });
  assert.equal((await cached.updater.check()).status, 'staged');
  assert.deepEqual(cached.calls.map(([action]) => action), ['fetch', 'stage']);
});

test('OTA pause cancels a pending update but preserves the current bundle; builtin rollback is deferred', async () => {
  for (const current of [null, 'c'.repeat(64)]) {
    const f = fixture({ current, manifest: release({ action: 'pause' }) });
    assert.equal((await f.updater.check()).status, 'paused');
    assert.deepEqual(f.calls.at(-1), ['stage', { bundleId: current }]);
  }
  const f = fixture({ current: 'c'.repeat(64), manifest: release({ action: 'builtin' }) });
  assert.equal((await f.updater.check()).status, 'builtin-staged');
  assert.deepEqual(f.calls.at(-1), ['reset']);
});

test('OTA retries failed checks and serializes concurrent launch/resume requests', async () => {
  const f = fixture();
  const first = f.updater.check();
  assert.equal(first, f.updater.check());
  await first;
  assert.equal(f.calls.filter(([action]) => action === 'fetch').length, 1);
  f.replaceEnvelope({ payload: 'bad', signature: 'bad' });
  await assert.rejects(f.updater.check());
  f.replaceEnvelope(signEnvelope(release(), keys.privateKey));
  assert.equal((await f.updater.check()).status, 'staged');
});

test('OTA rejects replayed pointers while allowing an explicitly reissued older bundle', async () => {
  const f = fixture({ manifest: release({ issuedAt: 100 }) });
  await f.updater.check();
  f.replaceEnvelope(signEnvelope(release({ action: 'pause', issuedAt: 99 }), keys.privateKey));
  await assert.rejects(f.updater.check(), /incompatible/);
  f.replaceEnvelope(signEnvelope(release({ issuedAt: 101 }), keys.privateKey));
  assert.equal((await f.updater.check()).status, 'staged');
});

test('OTA production config requires HTTPS and a valid RSA public key', () => {
  assert.equal(normalizePublicKey(keys.publicKey), keys.publicKey);
  assert.equal(normalizePublicKey(keys.publicKey.replaceAll('\n', '\\n')), keys.publicKey);
  for (const url of ['http://example.test', 'https://user:pass@example.test', 'https://x.r2.dev', 'https://example.test/?secret=x']) {
    assert.throws(() => normalizeBaseUrl(url));
  }
  assert.equal(normalizeBaseUrl('https://example.test/ota/'), 'https://example.test/ota');
});

test('OTA native fingerprint covers plugins, permissions, native assets and background runners', () => {
  for (const file of ['package-lock.json', 'capacitor.config.json', 'android/app/src/main/AndroidManifest.xml',
    'ios/App/App/Info.plist', 'ios/App/App/Assets.xcassets/icon.png', 'android/app/src/main/java/App.java', 'public/runners/offline-recitation.js']) {
    assert.ok(isNativeInput(file), file);
  }
  for (const file of ['src/App.jsx', 'android/app/src/main/assets/public/index.html', 'ios/App/App/public/index.html',
    'ios/App/CapApp-SPM/Package.swift', 'android/app/src/main/assets/capacitor.config.json', 'android/local.properties']) {
    assert.ok(!isNativeInput(file), file);
  }
});

test('OTA publisher signs a pointer with conditional writes to prevent concurrent overwrite', async () => {
  const old = release({ issuedAt: Date.now() });
  const calls = [];
  const result = await publishPointer({
    get: async () => ({ body: JSON.stringify(signEnvelope(old, keys.privateKey)), etag: 'old-etag' }),
    put: async (...args) => calls.push(args),
  }, { ...old, action: 'pause' }, keys.privateKey, keys.publicKey);
  assert.ok(result.issuedAt > old.issuedAt);
  assert.equal(calls[0][2].ifMatch, 'old-etag');
  assert.equal(calls[0][2].cacheControl, 'no-store, max-age=0');
  assert.equal(readSignedEnvelope(JSON.parse(calls[0][1]), keys.publicKey).action, 'pause');
  await assert.rejects(publishPointer({ get: async () => null, put: async () => { throw new Error('precondition failed'); } }, old, keys.privateKey, keys.publicKey));
});

test('OTA runtime stays stable across web edits and CRLF but changes for native and dependency edits', async () => {
  const parent = path.resolve('tmp');
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(path.join(parent, 'ota-fingerprint-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: directory });
    await mkdir(path.join(directory, 'android'), { recursive: true });
    const manifest = path.join(directory, 'android', 'settings.gradle');
    const ignoreFile = path.join(directory, 'android', '.gitignore');
    await writeFile(manifest, 'original native config\n');
    await writeFile(ignoreFile, 'build/\n');
    await writeFile(path.join(directory, 'package-lock.json'), '{}\n');
    const first = nativeFingerprint(directory, {});
    const originalPath = process.env.PATH;
    try {
      process.env.PATH = directory;
      assert.equal(nativeFingerprint(directory, {}), first, 'Native fingerprint must not resolve Git from a caller-controlled PATH');
    } finally {
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
    }
    await writeFile(manifest, 'original native config\r\n');
    await writeFile(ignoreFile, 'build/\r\n');
    assert.equal(nativeFingerprint(directory, {}), first, 'Windows/Linux line endings must agree');
    await writeFile(path.join(directory, 'web.js'), 'new web content');
    assert.equal(nativeFingerprint(directory, {}), first, 'Web edits remain OTA compatible');
    await writeFile(manifest, 'changed native config\n');
    assert.notEqual(nativeFingerprint(directory, {}), first, 'Native changes require a store runtime');
    await writeFile(manifest, 'original native config\n');
    await writeFile(path.join(directory, 'package-lock.json'), '{"newPlugin":true}\n');
    assert.notEqual(nativeFingerprint(directory, {}), first, 'Dependency changes require a store runtime');
    assert.notEqual(nativeFingerprint(directory, { publicKey: 'rotated' }), nativeFingerprint(directory, {}));
  } finally {
    assert.ok(directory.startsWith(`${parent}${path.sep}`));
    await rm(directory, { recursive: true, force: true });
  }
});

test('OTA packages only the matching mobile web build and signs the actual zip bytes', async () => {
  const parent = path.resolve('tmp');
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(path.join(parent, 'ota-test-'));
  try {
    const web = path.join(directory, 'web');
    await mkdir(web);
    await writeFile(path.join(web, 'index.html'), '<html>synthetic OTA test</html>');
    await writeFile(path.join(web, 'ota-build.json'), JSON.stringify(config));
    const zip = path.join(directory, 'bundle.zip');
    const metadata = await packageWebBundle(web, zip, config, keys.privateKey);
    const binary = await readFile(zip);
    assert.equal(binary.readUInt16LE(0), 0x4b50);
    assert.ok(verify('sha256', binary, keys.publicKey, Buffer.from(metadata.signature, 'base64')));
    assert.equal(metadata.bundleId, metadata.checksum);
    await assert.rejects(packageWebBundle(web, zip, { ...config, runtime: 'c'.repeat(64) }, keys.privateKey), /metadata/);
    await writeFile(path.join(web, 'secret.pem'), 'synthetic secret');
    await assert.rejects(packageWebBundle(web, zip, config, keys.privateKey), /sensitive/);
  } finally {
    assert.ok(directory.startsWith(`${parent}${path.sep}`));
    await rm(directory, { recursive: true, force: true });
  }
});
