import assert from 'node:assert/strict';
import console from 'node:console';
import { URL } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const requests = [];
  await page.route('**/__page-performance', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    const history = path.endsWith('/quran-sessions');
    await setTimeout(history ? 1200 : 100);
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
    const body = path.endsWith('/start') ? { attempt: { id: 9, status: 'started' } }
      : path.includes('daily-challenge') ? { date, points: 10, attempt: null }
      : history ? { rows: [], points: {} } : { date, plan: { id: 1 }, todayAmounts: [] };
    await route.fulfill({ json: body });
  });
  await page.goto('http://localhost:3000/__page-performance');
  await page.addScriptTag({ type: 'module', content: `
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    window.preambleReady = true;
  ` });
  await page.waitForFunction(() => globalThis.preambleReady);
  await page.addScriptTag({ type: 'module', content: `
    import React from '/node_modules/.vite/deps/react.js';
    import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
    import useStudentPlan from '/src/hooks/useStudentPlan.js';
    import * as service from '/src/services/offlineStudentService.js';
    import { offlineRecitationStore as storage } from '/src/services/offlineRecitationStore.js';
    import { offlineActorKey } from '/src/services/offlineOperationsService.js';
    window.pageTest = { service, storage, key: id => offlineActorKey(id, 'student') + ':workspace' };
    function Probe() {
      const plan = useStudentPlan(77, 'test-date');
      window.planState = plan;
      return React.createElement('div', null, plan.data?.today ? 'today-ready' : 'loading');
    }
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Probe));
  ` });
  await page.waitForFunction(() => globalThis.planState?.data?.today);
  assert.equal(await page.evaluate(() => globalThis.planState.loading), true, 'today displays while history remains pending');
  await page.waitForFunction(() => !globalThis.planState.loading);
  assert.equal(requests.filter(path => path.endsWith('/quran-today')).length, 1);
  requests.length = 0;
  const challenge = await page.evaluate(() => globalThis.pageTest.service.loadOfflineDailyChallenge(78));
  assert.equal(challenge.attempt, null);
  assert.equal(requests.length, 1);
  assert.ok(requests[0].endsWith('/daily-challenge'));
  const started = await page.evaluate(async challenge => {
    const { service, storage, key } = globalThis.pageTest;
    const attempt = await service.startOfflineDailyChallenge(78, challenge);
    const saved = await storage.getSnapshot(key(78));
    return { attempt, saved: saved.dailyChallenge.attempt, list: saved.dailyChallenges[0].attempt };
  }, challenge);
  assert.equal(started.saved.id, 9);
  assert.deepEqual(started.saved, started.attempt);
  assert.deepEqual(started.list, started.attempt);
  await page.evaluate(async () => {
    const { storage, key } = globalThis.pageTest;
    const workspace = await storage.getSnapshot(key(78));
    workspace.dailyChallenge.pendingSync = true;
    workspace.dailyChallenge.attempt.status = 'pending_sync';
    workspace.dailyChallenges = [workspace.dailyChallenge];
    await storage.cacheSnapshot(key(78), workspace);
  });
  assert.equal((await page.evaluate(() => globalThis.pageTest.service.loadOfflineDailyChallenge(78))).attempt.status, 'pending_sync');
  await page.context().setOffline(true);
  assert.equal((await page.evaluate(() => globalThis.pageTest.service.loadOfflineDailyChallenge(78))).attempt.status, 'pending_sync');
  console.log('PASS: progressive home, one today request, narrow challenge load, durable attempt, pending and offline preservation');
} finally { await browser.close(); }
