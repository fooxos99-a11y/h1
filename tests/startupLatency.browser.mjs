import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const base = 'http://127.0.0.1:3011';
const evidence = [];
await mkdir('outputs/recitation-recovery', { recursive: true });
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    for (const width of [360, 768, 1440]) for (const scenario of ['slow-entry', 'login', 'login-denied']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [];
      let probes = 0, evaluations = 0, logins = 0, release, sawEvaluation;
      const gate = new Promise(resolve => { release = resolve; });
      const evaluationStarted = new Promise(resolve => { sawEvaluation = resolve; });
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', async route => {
        const url = new globalThis.URL(route.request().url());
        assert.equal(url.hostname, '127.0.0.1');
        const path = url.pathname;
        if (path === '/api/health') { probes++; return route.fulfill({ json: { ok: true } }); }
        if (path === '/api/auth/login') {
          logins++;
          return route.fulfill(scenario === 'login-denied'
            ? { status: 401, json: { message: 'رقم الحساب غير صحيح.' } }
            : { json: { id: 990, role: 'supervisor', name: 'معلم فحص الدخول', token: 'local-synthetic-session-only', dashboardPermissions: [] } });
        }
        if (path === '/api/dashboard-bootstrap') return route.fulfill({ json: {
          settings: { staffAttendanceSource: 'supervisor', recitationAttendanceSource: 'teacher' }, permissions: ['quranEvaluation'] } });
        if (path === '/api/supervisors/990/quran-evaluation') {
          evaluations++;
          const data = await page.evaluate(() => globalThis.startupRecoveryFixture?.evaluation);
          sawEvaluation();
          if (scenario === 'slow-entry') await gate;
          return route.fulfill({ json: data }).catch(error => { if (!page.isClosed() && !route.request().failure()) throw error; });
        }
        if (path === '/api/quran/chapters') return route.fulfill({ json: [] });
        if (path === '/api/dashboard-permissions/me') return route.fulfill({ json: { permissions: [] } });
        if (path.includes('settings')) return route.fulfill({ json: { staffAttendanceSource: 'supervisor', recitationAttendanceSource: 'teacher', quranTaskExecutionSource: 'teacher' } });
        return route.fulfill({ json: {} });
      });
      const started = Date.now();
      try {
      await page.goto(`${base}/tests/fixtures/startup-recovery.html?scenario=${scenario === 'slow-entry' ? 'no-cache' : 'login'}`, { waitUntil: 'commit' });
      await page.waitForFunction(() => Boolean(globalThis.startupRecoveryFixture), { timeout: 60000 });
      if (scenario.startsWith('login')) {
        await page.getByLabel('رقم الحساب', { exact: false }).fill('990123456');
        const beforeLogin = probes;
        await page.getByRole('button', { name: 'دخول', exact: true }).click();
        if (scenario === 'login-denied') {
          await page.getByText('رقم الحساب غير صحيح.', { exact: true }).waitFor();
          assert.equal(await page.evaluate(() => globalThis.localStorage.getItem('wajeh_role')), null);
          assert.equal(evaluations, 0);
        } else {
          await page.getByText('طالب محلي تجريبي', { exact: true }).first().waitFor({ state: 'visible' });
          // A post-login /health request here used to unmount and restart entry.
          assert.equal(probes, beforeLogin + 1); // AccountPortal's ongoing reachability check only.
          assert.equal(logins, 1);
        }
      } else {
        await evaluationStarted;
        await page.getByText('التحميل أبطأ من المعتاد. يمكنك الانتظار أو إعادة المحاولة.').waitFor({ timeout: 30000 });
        assert.equal(await page.getByText('تعذر إكمال التحميل. أعد المحاولة.', { exact: true }).count(), 0);
        release();
        await page.getByText('طالب محلي تجريبي', { exact: true }).first().waitFor({ state: 'visible' });
        assert.equal(await page.getByRole('alert').count(), 0);
        assert.equal(await page.evaluate(() => globalThis.localStorage.getItem('wajeh_role')), 'supervisor');
      }
      assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth), true);
      assert.deepEqual(errors, []);
      const screenshot = `outputs/recitation-recovery/startup-${engine.name()}-${width}-${scenario}.png`;
      await page.screenshot({ path: screenshot, fullPage: true });
      evidence.push({ engine: engine.name(), width, scenario, probes, evaluations, logins, ms: Date.now() - started, errors });
      } catch (error) {
        await writeFile('outputs/recitation-recovery/startup-browser-failure.json', JSON.stringify({ scenario, width, url: page.url(), errors, body: await page.locator('body').innerText() }, null, 2));
        await page.screenshot({ path: 'outputs/recitation-recovery/startup-browser-failure.png' });
        throw error;
      }
      await context.close();
      globalThis.process.stdout.write(`${engine.name()} ${width} ${scenario} passed\n`);
    }
  } finally { await browser.close(); }
}
await writeFile('outputs/recitation-recovery/startup-browser-evidence.json', JSON.stringify(evidence, null, 2));
