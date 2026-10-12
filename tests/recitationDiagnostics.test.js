import assert from 'node:assert/strict';
import test from 'node:test';
import { logRecitationFailure } from '../server/services/recitationDiagnostics.js';

test('recitation diagnostics expose a safe code and source location without private error details', () => {
  const lines = [];
  const error = Object.assign(new Error('password=private student payload'), {
    code: 'ER_BAD_FIELD_ERROR', sql: 'SELECT private_data',
    stack: 'Error: password=private\n    at save (file:///var/www/app/server/services/save.js:42:9)',
  });
  logRecitationFailure(error, 'request-123', 'task', line => lines.push(line));
  assert.deepEqual(JSON.parse(lines[0]), { event: 'recitation_error', requestId: 'request-123',
    phase: 'task', code: 'ER_BAD_FIELD_ERROR', location: 'server/services/save.js:42:9' });
  assert.doesNotMatch(lines[0], /private|password|SELECT|var\/www/);
});

test('untrusted diagnostic codes and request IDs cannot inject secrets or log lines', () => {
  const lines = [];
  logRecitationFailure({ code: 'secret\nTOKEN=value', stack: null }, 'secret\nTOKEN=value', 'unexpected', line => lines.push(line));
  assert.deepEqual(JSON.parse(lines[0]), { event: 'recitation_error', phase: 'session', code: 'SERVER_ERROR' });
});
