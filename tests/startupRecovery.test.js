import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import { isTemporaryReadFailure, retryTemporaryRead, withinTimeout } from '../src/lib/asyncRecovery.js';
import { appResumeEvent, subscribeRecitationResume } from '../src/lib/recitationResume.js';
import { singleFlight } from '../src/lib/asyncRequests.js';

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const storage = () => {
  const values = new Map([['madarij_native_session', '1']]);
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
async function nativeSession(secure, extra = {}) {
  const source = (await read('../src/lib/authSession.js'))
    .replace(/^import[^\n]+\r?\n/gm, '').replace(/\bexport /g, '');
  const localStorage = storage();
  const auth = vm.runInNewContext(`${source}\n({getBearerToken, persistAuthSession, clearAuthSession, getAuthSessionMarker});`, {
    Capacitor: { isNativePlatform: () => true },
    getSiteConfig: () => ({ secureStoragePrefix: 'test.' }),
    KeychainAccess: { afterFirstUnlockThisDeviceOnly: 'test' },
    SecureStorage: { setKeyPrefix: async () => {}, setDefaultKeychainAccess: async () => {}, remove: async () => {}, ...secure },
    withinTimeout, localStorage, ...extra,
  });
  return { ...auth, localStorage };
}

test('temporary native initialization failures recover without signing out', async () => {
  let setups = 0;
  const auth = await nativeSession({
    setKeyPrefix: async () => { if (++setups === 1) throw new Error('temporary'); },
    get: async () => 'recovered',
  });
  assert.equal(await auth.getBearerToken(), 'recovered');
  assert.equal(setups, 2);
  assert.equal(auth.getAuthSessionMarker(), '1');
});

test('empty startup reads are retried and never poison the cached session', async () => {
  let reads = 0;
  const auth = await nativeSession({ get: async () => ++reads <= 2 ? null : 'recovered' });
  assert.equal(await auth.getBearerToken(), '');
  assert.equal(await auth.getBearerToken(), 'recovered');
  assert.equal(await auth.getBearerToken(), 'recovered');
  assert.equal(reads, 3);
});

test('parallel native requests share one credential read and fresh recovery reads storage again', async () => {
  const gate = deferred();
  let reads = 0;
  const auth = await nativeSession({ get: async () => { reads++; return gate.promise; } });
  const requests = [auth.getBearerToken(), auth.getBearerToken(), auth.getBearerToken({ fresh: true })];
  gate.resolve('persisted');
  assert.deepEqual(await Promise.all(requests), ['persisted', 'persisted', 'persisted']);
  assert.equal(reads, 1);
  await auth.getBearerToken({ fresh: true });
  assert.equal(reads, 2);
});

test('a completed read from a previous login never replaces a newer credential', async () => {
  const gate = deferred();
  const auth = await nativeSession({ get: () => gate.promise, set: async () => {} });
  const oldRead = auth.getBearerToken();
  await auth.persistAuthSession('new-session');
  gate.resolve('old-session');
  await oldRead;
  assert.equal(await auth.getBearerToken(), 'new-session');
});

test('stuck secure storage leaves the session intact and a later attempt can recover', async () => {
  let stuck = true;
  const auth = await nativeSession({
    setKeyPrefix: () => stuck ? new Promise(() => {}) : Promise.resolve(),
    get: async () => 'recovered',
  }, { withinTimeout: (operation, _timeout, message) => withinTimeout(operation, 5, message) });
  await assert.rejects(auth.getBearerToken(), { code: 'LOCAL_STORAGE_TIMEOUT' });
  assert.equal(auth.getAuthSessionMarker(), '1');
  stuck = false;
  assert.equal(await auth.getBearerToken(), 'recovered');
});

test('a stuck local read is bounded and temporary read retries exclude denial, rate limiting and cancellation', async () => {
  await assert.rejects(withinTimeout(() => new Promise(() => {}), 5, 'unavailable'), { code: 'LOCAL_STORAGE_TIMEOUT' });
  let calls = 0;
  assert.equal(await retryTemporaryRead(async () => { if (++calls === 1) throw new TypeError('network'); return 'ok'; }), 'ok');
  assert.equal(calls, 2);
  for (const error of [{ status: 401 }, { status: 403 }, { status: 429 }, { name: 'AbortError' }]) {
    calls = 0;
    await assert.rejects(retryTemporaryRead(async () => { calls++; throw error; }), value => value === error);
    assert.equal(calls, 1);
  }
  assert.equal(isTemporaryReadFailure({ status: 503 }), true);
  calls = 0;
  await assert.rejects(retryTemporaryRead(async () => { calls++; throw new Error('old account'); }, { isCurrent: () => false }));
  assert.equal(calls, 1);
});

test('native resume refreshes a visible online page and unsubscribes cleanly', () => {
  const windowTarget = new EventTarget();
  const documentTarget = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  let count = 0;
  const unsubscribe = subscribeRecitationResume({ windowTarget, documentTarget, isOnline: () => true, refresh: () => count++ });
  windowTarget.dispatchEvent(new Event(appResumeEvent));
  assert.equal(count, 1);
  documentTarget.visibilityState = 'hidden';
  windowTarget.dispatchEvent(new Event(appResumeEvent));
  assert.equal(count, 1);
  unsubscribe();
  documentTarget.visibilityState = 'visible';
  windowTarget.dispatchEvent(new Event(appResumeEvent));
  assert.equal(count, 1);
});

async function evaluationHook({ cached, online = true, merge = async (_, value) => value, timeout = withinTimeout } = {}) {
  const source = (await read('../src/hooks/useTeacherEvaluationData.js'))
    .replace(/^import[^\n]+\r?\n/gm, '').replace('export default ', '');
  const network = deferred();
  let state;
  let version = 1;
  const runEvaluationHook = vm.runInNewContext(`${source}\nuseTeacherEvaluationData;`, {
    useCallback: value => value, useEffect: () => {},
    useState: value => { state = value; return [state, update => { state = typeof update === 'function' ? update(state) : update; }]; },
    useRef: value => ({ current: value }),
    navigator: { onLine: online }, getTenantRegistrationNumber: () => 'test', getAuthSessionVersion: () => version,
    getCachedTeacherEvaluation: async () => cached,
    studentsApi: { getSupervisorQuranEvaluation: () => network.promise },
    mergeLocalTeacherEvaluation: merge, cacheTeacherEvaluation: async () => {},
    recitationErrorMessage: error => error.message, retryTemporaryRead, withinTimeout: timeout,
  });
  const hook = runEvaluationHook(11, true, () => {});
  return { hook, network, state: () => state, changeAccount: () => version++ };
}

test('an unreadable pending evaluation cannot hang the screen or expose an unsafe fresh task; retry can recover', async () => {
  let readable = false;
  const env = await evaluationHook({ merge: async (_, value) => readable ? value : new Promise(() => {}),
    timeout: (operation, _ms, message) => withinTimeout(operation, 5, message) });
  const first = env.hook.load();
  env.network.resolve({ tasks: [{ id: 7 }], students: [] });
  await first;
  assert.equal(env.state().loading, false);
  assert.equal(env.state().data, null);
  assert.match(env.state().error, /التقييمات المحفوظة/);
  readable = true;
  await env.hook.load({ fresh: true });
  assert.equal(env.state().data.tasks[0].id, 7);
});

test('online entry waits for the server and never exposes an old local evaluation', async () => {
  const cached = { tasks: [{ id: 1 }], students: [{ id: 11 }], local: true };
  const env = await evaluationHook({ cached });
  const pending = env.hook.load({ fresh: true });
  await new Promise(setImmediate);
  assert.equal(env.state().data, null);
  assert.equal(env.state().loading, true);
  const fresh = { tasks: [{ id: 2 }], students: [] };
  env.network.resolve(fresh);
  await pending;
  assert.equal(env.state().data, fresh);
  assert.equal(env.state().error, '');
});

test('a late server read cannot replace a local save or data from a different account', async () => {
  for (const change of ['save', 'account']) {
    const env = await evaluationHook();
    const pending = env.hook.load();
    await new Promise(setImmediate);
    if (change === 'save') env.hook.setData({ tasks: [{ id: 'saved' }], students: [] });
    else env.changeAccount();
    env.network.resolve({ tasks: [{ id: 'old' }], students: [] });
    await pending;
    assert.notEqual(env.state().data?.tasks[0]?.id, 'old');
  }
});

test('offline entry exposes cached evaluation without a network wait', async () => {
  const cached = { tasks: [], students: [] };
  const env = await evaluationHook({ cached, online: false });
  await env.hook.load();
  assert.equal(env.state().data, cached);
  assert.equal(env.state().loading, false);
});

test('a slow local cache cannot hold a successful online read or overwrite fresh data', async () => {
  const cache = deferred();
  const env = await evaluationHook({ cached: cache.promise });
  const pending = env.hook.load();
  const fresh = { tasks: [{ id: 'fresh' }], students: [] };
  env.network.resolve(fresh);
  await pending;
  assert.equal(env.state().data, fresh);
  cache.resolve({ tasks: [{ id: 'stale' }], students: [] });
  await new Promise(setImmediate);
  assert.equal(env.state().data, fresh);
});

async function dashboardEffect(load) {
  const source = (await read('../src/pages/WajehDashboard.jsx')).replaceAll('\r\n', '\n');
  const start = source.indexOf('  useEffect(() => {\n    if (!isOnline)');
  const end = source.indexOf('  }, [bootstrapRevision', start);
  assert.ok(start > 0 && end > start);
  const callback = source.slice(start + '  useEffect('.length, end) + '  }';
  let version = 1;
  const state = { permissions: ['quranEvaluation'], error: '', timers: new Map(), calls: 0 };
  const effect = vm.runInNewContext(`(${callback})`, {
    isOnline: true, isManager: false, isSupervisor: true, isAdmin: false, isReciter: false,
    cachedSettings: {}, defaultSettings: {}, navigator: { onLine: true },
    getAuthSessionVersion: () => version, isTemporaryReadFailure,
    readStoredDashboardPermissions: () => state.permissions,
    storeDashboardPermissions: value => { state.permissions = value; },
    setDashboardPermissions: value => { state.permissions = value; },
    setSettings: value => { state.settings = value; },
    setBootstrapError: value => { state.error = value; },
    setIsDashboardLoading: value => { state.loading = value; },
    studentsApi: { getDashboardBootstrap: () => { state.calls++; return load(); } },
    subscribeRecitationResume: ({ refresh }) => { state.refresh = refresh; return () => {}; },
    document: {}, window: {
      setTimeout: callback => { const key = Symbol(); state.timers.set(key, callback); return key; },
      clearTimeout: key => state.timers.delete(key),
    },
  });
  const cleanup = effect();
  return { state, cleanup, changeAccount: () => version++ };
}

test('temporary bootstrap failure retains permissions and automatically applies a later server response', async () => {
  let attempt = 0;
  const env = await dashboardEffect(async () => {
    if (++attempt === 1) throw Object.assign(new Error('temporary'), { status: 503 });
    return { settings: { loaded: true }, permissions: [] };
  });
  await new Promise(setImmediate);
  assert.equal(env.state.permissions[0], 'quranEvaluation');
  assert.equal(env.state.error, '');
  assert.equal(env.state.timers.size, 1);
  assert.equal(env.state.loading, true);
  env.state.timers.values().next().value();
  await new Promise(setImmediate);
  assert.equal(env.state.permissions.length, 0, 'An authoritative permission revocation must still apply');
  assert.equal(env.state.settings.loaded, true);
  assert.equal(env.state.loading, false);
  env.cleanup();
});

test('bootstrap permission denial revokes cached access without retrying', async () => {
  const env = await dashboardEffect(async () => { throw Object.assign(new Error('denied'), { status: 403 }); });
  await new Promise(setImmediate);
  assert.equal(env.state.permissions.length, 0);
  assert.equal(env.state.timers.size, 0);
  assert.equal(env.state.calls, 1);
  env.cleanup();
});

test('bootstrap recovery stops after two retries and never changes another account', async () => {
  const failed = await dashboardEffect(async () => { throw new TypeError('offline'); });
  for (let attempt = 0; attempt < 3; attempt++) {
    await new Promise(setImmediate);
    const timer = failed.state.timers.values().next().value;
    if (timer) timer();
  }
  await new Promise(setImmediate);
  assert.equal(failed.state.calls, 3);
  assert.equal(failed.state.permissions[0], 'quranEvaluation');
  assert.equal(failed.state.error, 'offline');
  failed.cleanup();
  const gate = deferred();
  const old = await dashboardEffect(() => gate.promise);
  old.changeAccount();
  gate.resolve({ settings: { oldAccount: true }, permissions: [] });
  await new Promise(setImmediate);
  assert.equal(old.state.settings, undefined);
  assert.equal(old.state.permissions[0], 'quranEvaluation');
  old.cleanup();
});

async function entryRefresh({ online = true, credential, probe } = {}) {
  const source = (await read('../src/services/entryRefresh.js')).replace(/^import[^\n]+\r?\n/gm, '').replace(/\bexport /g, '');
  return vm.runInNewContext(`${source}\nrefreshAppEntry;`, {
    navigator: { onLine: online }, hasAuthSession: () => true,
    getBearerToken: credential || (async () => 'session'),
    probeServerConnectivity: probe || (async () => true), retryTemporaryRead,
    advanceEntryRefreshVersion: () => {},
  });
}

test('opening offline blocks entry before reading credentials or making a request', async () => {
  let calls = 0;
  const refresh = await entryRefresh({ online: false, credential: async () => { calls++; }, probe: async () => { calls++; } });
  await assert.rejects(refresh(), /يلزم الاتصال بالإنترنت/);
  assert.equal(calls, 0);
});

test('entry rereads the native credential and confirms server reachability with one retry', async () => {
  const calls = [];
  let probes = 0;
  const refresh = await entryRefresh({
    credential: async options => { assert.equal(options.fresh, true); calls.push('credential'); },
    probe: async () => { calls.push('probe'); return ++probes > 1; },
  });
  await refresh();
  assert.deepEqual(calls, ['credential', 'probe', 'probe']);
});

test('an unavailable server rejects entry after bounded retries', async () => {
  let probes = 0;
  const refresh = await entryRefresh({ probe: async () => { probes++; return false; } });
  await assert.rejects(refresh(), /تعذر الاتصال بالخادم/);
  assert.equal(probes, 2);
});

test('required student refresh never reads or falls back to a stale snapshot, including permission denial', async () => {
  const source = await read('../src/services/offlineOperationsService.js');
  const start = source.indexOf('export async function loadOfflineSnapshot(');
  const end = source.indexOf('export async function commitOfflineOperation(', start);
  let cacheReads = 0;
  const load = vm.runInNewContext(`${source.slice(start, end).replace('export ', '')}\nloadOfflineSnapshot;`, {
    offlineActorKey: id => `student:${id}`, getAuthSessionVersion: () => 1, isOnline: () => true,
    offlineRecitationStore: { getSnapshot: async () => { cacheReads++; return { stale: true }; } },
    fetchSnapshot: (_key, _version, loader) => loader(),
  });
  assert.equal((await load(7, 'plan', async () => ({ fresh: true }), { requireFresh: true })).fresh, true);
  for (const status of [403, 503]) await assert.rejects(load(7, 'plan', async () => { throw Object.assign(new Error('unavailable'), { status }); }, { requireFresh: true }), error => error.status === status);
  assert.equal(cacheReads, 0);
});

test('a new entry starts a new snapshot request and a late old response cannot replace its cache', async () => {
  const source = await read('../src/services/offlineOperationsService.js');
  const definition = source.slice(source.indexOf('const fetchSnapshot ='), source.indexOf('export async function commitOfflineOperation')).replaceAll('export ', '');
  let entry = 1;
  const writes = [];
  const load = vm.runInNewContext(`${definition}\nloadOfflineSnapshot;`, {
    singleFlight, withinTimeout, reportOfflineCacheFailure: () => assert.fail('cache should remain available'),
    getEntryRefreshVersion: () => entry, getAuthSessionVersion: () => 7,
    offlineActorKey: id => `student:${id}`, isOnline: () => true,
    offlineRecitationStore: { cacheSnapshot: async (_key, value) => writes.push(value) },
  });
  const oldGate = deferred();
  const old = load(7, 'plan', () => oldGate.promise, { requireFresh: true });
  await new Promise(setImmediate);
  entry++;
  const current = await load(7, 'plan', async () => 'fresh', { requireFresh: true });
  assert.equal(current, 'fresh');
  oldGate.resolve('old');
  await old;
  assert.deepEqual(writes, ['fresh']);
});

test('settings from before reopening cannot satisfy or overwrite the next entry refresh', async () => {
  const source = (await read('../src/services/publicSettingsCache.js')).replace(/^import[^\n]+\r?\n/gm, '').replace(/\bexport /g, '');
  let entry = 1;
  const oldGate = deferred();
  const newGate = deferred();
  let calls = 0;
  const values = new Map();
  const service = vm.runInNewContext(`${source}\n({loadPublicSettingsCached, readPublicSettingsCache});`, {
    getTenantRegistrationNumber: () => 'test', getEntryRefreshVersion: () => entry, getSaudiDate: () => '2026-10-18',
    localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
    studentsApi: { getPublicSettings: () => ++calls === 1 ? oldGate.promise : newGate.promise },
  });
  const old = service.loadPublicSettingsCached({ refresh: true });
  entry++;
  const current = service.loadPublicSettingsCached({ refresh: true });
  assert.equal(calls, 2);
  newGate.resolve({ fresh: true });
  await current;
  oldGate.resolve({ stale: true });
  await old;
  assert.equal(service.readPublicSettingsCache().fresh, true);
});
