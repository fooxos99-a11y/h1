import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NazemAdapter } from '../server/integrations/nazem/adapter.js';
import { failNazemJob } from '../server/integrations/nazem/queue.js';
import { transientNazemError, blockedNazemError } from '../server/integrations/nazem/errors.js';
import { nazemErrorDiagnostics } from '../server/integrations/nazem/errorDiagnostics.js';

function followUpAdapter(statuses) {
  const adapter = new NazemAdapter();
  const calls = { logins: 0, reads: 0 };
  adapter.context = { cookies: async () => [] };
  adapter.page = {
    clock: { install: async () => {}, setFixedTime: async () => {} },
    goto: async () => {},
    url: () => 'https://nazem-plus.com/educational-plans/191/follow-up',
    waitForResponse: async () => {
      const status = statuses[calls.reads++];
      assert.ok(status, 'unexpected extra request');
      return {
        status: () => status,
        ok: () => status === 200,
        json: async () => ({ status: status === 200, data: [] }),
        url: () => 'https://api.nazem-plus.com/api/educational-plans/191/follow-up?date=2026-09-09',
        request: () => ({ allHeaders: async () => ({}) }),
      };
    },
  };
  adapter.login = async (options) => {
    assert.equal(options.forceFresh, true);
    calls.logins++;
  };
  return { adapter, calls };
}

for (const status of [401, 419]) {
  test(`initial follow-up HTTP ${status} renews authentication once and reads the same plan/date`, async () => {
    const { adapter, calls } = followUpAdapter([status, 200]);
    const result = await adapter.openFollowUp(191, '2026-09-09');
    assert.equal(result.status, true);
    assert.deepEqual(calls, { logins: 1, reads: 2 });
    assert.equal(adapter.followUpPayloadCache.get('191:2026-09-09'), result);
  });
}

test('repeated authentication rejection stops after one renewal; server errors do not force login', async () => {
  for (const statuses of [[401, 401], [503]]) {
    const { adapter, calls } = followUpAdapter(statuses);
    await assert.rejects(adapter.openFollowUp(191, '2026-09-09'), { code: 'NAZEM_FOLLOW_UP_LOAD_FAILED' });
    assert.equal(calls.reads, statuses.length);
    assert.equal(calls.logins, statuses.length - 1);
    assert.equal(adapter.followUpPayloadCache.size, 0);
  }
});

test('queue marks exhausted transport retries failed immediately and preserves dependency blocks', async () => {
  for (const [attemptCount, error, expected] of [
    [1, transientNazemError('connection', 'NAZEM_LOGIN_TIMEOUT'), 'retrying'],
    [2, transientNazemError('connection', 'NAZEM_LOGIN_TIMEOUT'), 'failed'],
    [1, blockedNazemError('waiting', 'NAZEM_LINK_WAITING_FOR_MEMORIZATION'), 'blocked'],
  ]) {
    const writes = [];
    const connection = { query: async (sql, params) => { writes.push({ sql, params }); return [{ affectedRows: 1 }]; } };
    assert.equal(await failNazemJob(connection, { id: 5, attemptCount, maxAttempts: 2 }, error), expected);
    assert.equal(writes[0].params[0], expected);
    assert.equal(writes[1].params[4], expected);
  }
});

test('transport diagnostics retain useful classifications without browser secrets', () => {
  const error = transientNazemError('failure', 'NAZEM_LOGIN_TIMEOUT', new Error('HTTP 503 Timeout ETIMEDOUT https://private.test/?password=secret Authorization: secret'));
  error.details = { stage: 'login-submit', token: 'secret' };
  assert.deepEqual(nazemErrorDiagnostics(error), { stage: 'login-submit', httpStatus: 503, networkCode: 'ETIMEDOUT', timedOut: true });
  assert.equal(JSON.stringify(nazemErrorDiagnostics(error)).includes('secret'), false);
});

test('already confirmed Nazem memorization also wakes dependent saved submissions', () => {
  const service = readFileSync(new URL('../server/integrations/nazem/service.js', import.meta.url), 'utf8');
  const branch = service.slice(service.indexOf('if (remote.authoritative) {'), service.indexOf('if (dailyFollowUpId) {', service.indexOf('if (remote.authoritative) {')));
  assert.match(branch, /await wakeNextBlockedNazemRecitation\(connection, job\)/);
  assert.match(branch, /return \{ \.\.\.remote, nextTaskRefresh, nextRecitationJobId \}/);
});
