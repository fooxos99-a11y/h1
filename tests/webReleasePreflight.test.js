import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { safePreflightFailure } from '../scripts/web-release/preflight.mjs';

test('preflight diagnostics expose only known error codes', () => {
  assert.deepEqual(safePreflightFailure('database', { code: 'PENDING_MIGRATIONS', message: 'private credentials' }), {
    event: 'WEB_PREFLIGHT_FAILED', phase: 'database', code: 'PENDING_MIGRATIONS',
  });
  assert.equal(safePreflightFailure('database', { code: 'private credentials' }).code, 'CHECK_FAILED');
});

test('preflight configuration failure does not disclose paths or raw errors', () => {
  const result = spawnSync(process.execPath, ['scripts/web-release/preflight.mjs', 'private-release', 'private-config'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), { event: 'WEB_PREFLIGHT_FAILED', phase: 'configuration', code: 'CHECK_FAILED' });
  assert.ok(!result.stdout.includes('private-'));
});
