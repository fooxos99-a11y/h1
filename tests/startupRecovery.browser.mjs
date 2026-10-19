import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';

const base = globalThis.process.env.STARTUP_RECOVERY_BASE || 'http://127.0.0.1:3017';
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    for (const width of [360, 768, 1440]) {
      for (const scenario of ['cache', 'no-cache', 'unavailable', 'denied', 'expired', 'offline']) {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        let releaseEvaluation;
        const evaluationGate = new Promise(resolve => { releaseEvaluation = resolve; });
        let resumeGate = Promise.resolve();
        let bootstraps = 0;
        let evaluations = 0;
        let recoverBootstrap = false;
        const page = await context.newPage();
        if (scenario === 'offline') await page.addInitScript(() => {
          globalThis.fixtureOnline = false;
          Object.defineProperty(globalThis.navigator, 'onLine', { get: () => globalThis.fixtureOnline });
        });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await context.route('**/*', async route => {
          const url = new globalThis.URL(route.request().url());
          if (url.hostname !== '127.0.0.1') return route.abort();
          if (!url.pathname.startsWith('/api/')) return route.continue();
          if (url.pathname === '/api/dashboard-bootstrap') {
            bootstraps++;
            if (scenario === 'expired') return route.fulfill({ status: 401, json: { message: 'انتهت جلسة الدخول.' } });
            await gate;
            await resumeGate;
            if (scenario === 'unavailable' && !recoverBootstrap) return route.fulfill({ status: 503, json: { message: 'تعذر الاتصال مؤقتًا.' } });
            if (scenario === 'cache' && bootstraps === 1) return route.fulfill({ status: 503, json: { message: 'تعذر الاتصال مؤقتًا.' } });
            return route.fulfill({ json: { settings: { staffAttendanceSource: 'supervisor', recitationAttendanceSource: 'teacher' },
              permissions: scenario === 'denied' ? [] : ['quranEvaluation', 'students'] } });
          }
          if (url.pathname === '/api/supervisors/990/quran-evaluation') {
            evaluations++;
            await gate;
            await evaluationGate;
            if (evaluations === 1 && scenario === 'no-cache') return route.fulfill({ status: 503, json: { message: 'تعذر الاتصال مؤقتًا.' } });
            const fresh = await page.evaluate(() => globalThis.startupRecoveryFixture.evaluation);
            fresh.students = fresh.students.map(student => ({ ...student, studentName: 'طالب محدث تجريبي' }));
            fresh.tasks = fresh.tasks.map(task => ({ ...task, studentName: 'طالب محدث تجريبي' }));
            return route.fulfill({ json: fresh });
          }
          if (url.pathname === '/api/quran/chapters') return route.fulfill({ json: [{ number: 95, name: 'التين', ayahCount: 8 }] });
          if (/settings/.test(url.pathname)) return route.fulfill({ json: { staffAttendanceSource: 'supervisor', recitationAttendanceSource: 'teacher' } });
          return route.fulfill({ json: {} });
        });
        const bootstrapStarted = page.waitForRequest('**/api/dashboard-bootstrap');
        const evaluationStarted = ['cache', 'no-cache', 'offline'].includes(scenario)
          ? page.waitForRequest('**/api/supervisors/990/quran-evaluation') : null;
        await page.goto(`${base}/tests/fixtures/startup-recovery.html?scenario=${scenario}`, { waitUntil: 'commit' });
        await page.waitForFunction(() => Boolean(globalThis.startupRecoveryFixture), { timeout: 60000 });
        if (scenario === 'offline') {
          await page.getByText('يلزم الاتصال بالإنترنت لفتح التطبيق.').waitFor();
          assert.equal(bootstraps, 0);
          assert.equal(evaluations, 0);
          await page.evaluate(() => { globalThis.fixtureOnline = true; globalThis.dispatchEvent(new globalThis.Event('online')); });
        }
        await bootstrapStarted;
        if (scenario === 'expired') {
          release();
          await page.waitForURL('**/login');
          await page.getByLabel('رقم الحساب', { exact: false }).waitFor();
          assert.equal(await page.evaluate(() => globalThis.localStorage.getItem('wajeh_role')), null);
          assert.equal(bootstraps, 2);
        } else {
          assert.equal(await page.getByText('طالب محلي تجريبي', { exact: true }).count(), 0);
          assert.equal(await page.getByText('طالب محدث تجريبي', { exact: true }).count(), 0);
          assert.equal(await page.getByRole('alert').count(), 0);
          assert.equal(await page.evaluate(() => JSON.parse(globalThis.localStorage.getItem('wajeh_dashboard_permissions')).includes('quranEvaluation')), true);
          release();
          if (evaluationStarted) {
            await evaluationStarted;
            assert.equal(await page.getByText('طالب محلي تجريبي', { exact: true }).count(), 0);
            assert.equal(await page.getByText('طالب محدث تجريبي', { exact: true }).count(), 0);
          }
          releaseEvaluation();
          if (scenario === 'denied') {
            await page.getByText('هذا الحساب لا يملك صلاحية الوصول إلى لوحة التحكم.').waitFor();
            assert.deepEqual(await page.evaluate(() => JSON.parse(globalThis.localStorage.getItem('wajeh_dashboard_permissions'))), []);
          } else if (scenario === 'unavailable') {
            const retry = page.getByRole('button', { name: 'إعادة المحاولة', exact: true });
            await retry.waitFor();
            assert.equal(bootstraps, 3);
            assert.equal(await page.evaluate(() => JSON.parse(globalThis.localStorage.getItem('wajeh_dashboard_permissions')).includes('quranEvaluation')), true);
            recoverBootstrap = true;
            await retry.focus();
            assert.equal(await retry.evaluate(element => element === globalThis.document.activeElement), true);
            await retry.press('Enter');
            await retry.waitFor({ state: 'detached' });
            assert.equal(bootstraps, 4);
            await page.getByText('طالب محدث تجريبي', { exact: true }).first().waitFor({ state: 'visible' });
          } else {
            await page.getByText('طالب محدث تجريبي', { exact: true }).first().waitFor({ state: 'visible' });
            if (scenario === 'cache') await page.waitForFunction(() => globalThis.document.querySelector('[role="alert"]') === null);
            await page.waitForTimeout(1200);
            assert.ok(scenario === 'cache' ? bootstraps >= 2 : scenario === 'offline' ? evaluations >= 1 : evaluations >= 2);
            assert.equal(await page.getByRole('alert').count(), 0);
            assert.equal(await page.evaluate(() => globalThis.localStorage.getItem('wajeh_role')), 'supervisor');
            if (scenario === 'cache') {
              await page.screenshot({ path: `outputs/entry-refresh-${engine.name()}-${width}.png`, fullPage: true });
              let resume;
              resumeGate = new Promise(resolve => { resume = resolve; });
              const nextBootstrap = page.waitForRequest('**/api/dashboard-bootstrap');
              const previousEvaluations = evaluations;
              await page.evaluate(() => globalThis.dispatchEvent(new globalThis.Event('madarij-app-resumed')));
              await nextBootstrap;
              await page.getByText('طالب محدث تجريبي', { exact: true }).first().waitFor({ state: 'hidden' });
              assert.equal(await page.getByText('طالب محدث تجريبي', { exact: true }).count(), 0);
              resume();
              await page.getByText('طالب محدث تجريبي', { exact: true }).first().waitFor({ state: 'visible' });
              assert.ok(evaluations > previousEvaluations);
            }
          }
        }
        assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth), true);
        assert.deepEqual(errors, []);
        await context.close();
      }
    }
  } finally { await browser.close(); }
}
globalThis.console.log('Required internet, fresh entry and resume, transient failures, keyboard retry, permission denial and expired sessions passed Chromium/WebKit at 360/768/1440px.');
