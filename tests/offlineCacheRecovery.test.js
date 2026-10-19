import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { singleFlight } from '../src/lib/asyncRequests.js';
import { withinTimeout } from '../src/lib/asyncRecovery.js';

const source = await readFile(new URL('../src/services/offlineOperationsService.js', import.meta.url), 'utf8');
const definition = source.slice(source.indexOf('const fetchSnapshot ='), source.indexOf('export async function commitOfflineOperation')).replaceAll('export ', '');
function fixture({ online = true, getSnapshot = async () => null, cacheSnapshot = async () => {} } = {}) {
  let failures = 0;
  let session = 1;
  const load = vm.runInNewContext(`${definition}\nloadOfflineSnapshot;`, {
    singleFlight, withinTimeout, reportOfflineCacheFailure: () => failures++,
    getEntryRefreshVersion: () => 1, getAuthSessionVersion: () => session,
    offlineActorKey: id => `supervisor:${id}`, isOnline: () => online,
    offlineRecitationStore: { getSnapshot, cacheSnapshot },
  });
  return { load, failures: () => failures, changeAccount: () => session++ };
}
test('online statistics survive failed local reads and writes and report degraded storage', async () => {
  const fail = async () => { throw new Error('native connection unavailable'); };
  const env = fixture({ getSnapshot: fail, cacheSnapshot: fail });
  const result = await env.load(11, 'statistics', async () => ({ students: 14 }));
  assert.equal(result.students, 14); assert.equal(env.failures(), 2);
});
test('a failed offline read cannot invent a report or invoke the server', async () => {
  const env = fixture({ online: false, getSnapshot: async () => { throw new Error('unreadable local data'); } });
  await assert.rejects(env.load(11, 'statistics', () => assert.fail('offline request')), /unreadable local/);
});
test('an existing snapshot never bypasses denied or expired access', async () => {
  for (const status of [401, 403]) {
    const env = fixture({ getSnapshot: async () => ({ private: true }) });
    await assert.rejects(env.load(11, 'statistics', async () => { throw Object.assign(new Error('denied'), { status }); }), error => error.status === status);
  }
});

test('switching accounts during a local read prevents stale display and a request in the wrong scope', async () => {
  let finish;
  const env = fixture({ getSnapshot: () => new Promise(resolve => { finish = resolve; }) });
  const read = env.load(11, 'statistics', () => assert.fail('old scope cannot make a new request'));
  const rejected = assert.rejects(read, error => error.status === 409);
  await new Promise(setImmediate);
  env.changeAccount(); finish({ private: true });
  await rejected;
});
