import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('student challenge and store use a durable offline queue with daily challenge guards and per-purchase idempotency', async () => {
  const [service, operations, bootstrap, challenge, store, migration] = await Promise.all([
    read('../src/services/offlineStudentService.js'),
    read('../src/services/offlineOperationsService.js'),
    read('../server/routes/offlineStudentRoutes.js'),
    read('../server/routes/dailyChallengeRoutes.js'),
    read('../server/routes/storeRoutes.js'),
    read('../server/migrations/2026.08.28.1-offline-student-and-persistent-sessions.js'),
  ]);

  assert.match(operations, /daily_challenge_submit/);
  assert.match(operations, /store_purchase/);
  assert.match(service, /daily-challenge:\$\{challenge\.date\}/);
  assert.doesNotMatch(service, /store-purchase:\$\{purchaseDate\}/);
  assert.match(service, /projectWorkspaceForToday/);
  assert.match(bootstrap, /offset <= 14/);
  assert.match(challenge, /submit_request_id/);
  assert.doesNotMatch(store, /الشراء متاح مرة واحدة فقط في اليوم/);
  assert.match(store, /WHERE student_id = \? AND request_id = \?/);
  assert.match(migration, /store_orders_student_daily_unique/);
  assert.match(migration, /daily_challenge_submit_request_unique/);
});

test('offline data refreshes invisibly on actual server recovery and sessions have no time expiry', async () => {
  const [connectivity, bridge, sessions, migration, app, requests] = await Promise.all([
    read('../src/hooks/useOnlineStatus.js'),
    read('../src/components/native/OfflineRecitationSyncBridge.jsx'),
    read('../server/services/authSessions.js'),
    read('../server/migrations/2026.08.28.1-offline-student-and-persistent-sessions.js'),
    read('../src/App.jsx'),
    read('../src/services/studentsApi.js'),
  ]);

  assert.match(connectivity, /fetch\(`\$\{getApiBase\(\)\}\/health`/);
  assert.match(connectivity, /serverConnectivityChangeEvent/);
  assert.match(bridge, /networkStatusChange/);
  assert.match(bridge, /serverConnectivityChangeEvent/);
  assert.match(bridge, /60_000/);
  assert.match(app, /<OfflineRecitationSyncBridge \/>/);
  assert.doesNotMatch(app, /OfflineSyncCenter|المزامنة والعمل دون إنترنت/);
  assert.match(sessions, /expires_at\)\s*VALUES \(\?, \?, \?, \?, NULL\)/);
  assert.doesNotMatch(sessions, /expires_at > NOW\(\)/);
  assert.match(sessions, /setSessionCookie\(req, res, TENANT_SESSION_COOKIE, cookieToken, AUTH_SESSION_DAYS\)/);
  assert.match(migration, /UPDATE auth_sessions SET expires_at = NULL/);
  assert.match(requests, /if \(response\.status === 401 && path !== '\/auth\/login' && !authSnapshot\s+&& sessionVersion === getAuthSessionVersion\(\)\) response = await fetchOnce\(\)/);
});
