import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOtaCiConfig } from '../scripts/ota/validate-ci-config.mjs';

const runtime = 'a'.repeat(64);
const configured = { OTA_ACTION: 'publish', GITHUB_EVENT_NAME: 'push', OTA_ENABLED: 'true', OTA_NATIVE_RUNTIME: runtime,
  VITE_API_BASE: 'https://example.com/api', VITE_API_BASE_URL: 'https://example.com', OTA_BASE_URL: 'https://updates.example.com', OTA_PUBLIC_KEY: 'synthetic' };
test('automatic publishing stops explicitly when disabled or missing the native approval', () => {
  assert.throws(() => validateOtaCiConfig({ ...configured, OTA_ENABLED: 'false' }, () => { throw new Error('Should not build'); }), /Automatic OTA is disabled/);
  assert.throws(() => validateOtaCiConfig({ ...configured, OTA_NATIVE_RUNTIME: '' }, () => ({})), /Missing repository variables: OTA_NATIVE_RUNTIME/);
});
test('matching runtime permits publishing while native changes stop before upload', () => {
  assert.equal(validateOtaCiConfig(configured, () => ({ runtime })).runtime, runtime);
  assert.throws(() => validateOtaCiConfig(configured, () => ({ runtime: 'b'.repeat(64) })), /Native runtime mismatch/);
});
test('manual validation and emergency pause retain their original disabled-channel behavior', () => {
  assert.equal(validateOtaCiConfig({ ...configured, GITHUB_EVENT_NAME: 'workflow_dispatch', OTA_ENABLED: 'false', OTA_ACTION: 'validate', OTA_NATIVE_RUNTIME: '' }, () => ({ runtime })).runtime, runtime);
  assert.equal(validateOtaCiConfig({ ...configured, GITHUB_EVENT_NAME: 'workflow_dispatch', OTA_ENABLED: 'false', OTA_ACTION: 'pause' }, () => ({ runtime: 'b'.repeat(64) })).runtime, 'b'.repeat(64));
  assert.throws(() => validateOtaCiConfig({ ...configured, OTA_NATIVE_RUNTIME: 'invalid' }, () => ({})), /Invalid approved/);
});
