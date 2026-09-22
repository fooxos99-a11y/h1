import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

test('web deployment rejects unsafe artifacts and rolls back failed activation', () => {
  const result = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['tests/webReleaseChecks.py'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});
