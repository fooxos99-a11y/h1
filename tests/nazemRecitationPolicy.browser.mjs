import assert from 'node:assert/strict';
import console from 'node:console';
import { URL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

await mkdir('outputs', { recursive: true });
const results = [];
for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch();
  try {
    for (const width of [360, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true });
      const page = await context.newPage();
      const errors = [];
      let phase = 'initial failure';
      page.on('pageerror', (error) => errors.push({ phase, message: error.message, stack: error.stack }));
      const submitted = [];
      let evaluationRequests = 0;
      let evaluationFails = true;
      let evaluationGate = null;
      const tasks = [10, 11].map((id) => ({ id, studentId: 99, studentName: 'طالب تجريبي', taskType: 'link',
        planId: 1, planVersion: 1, taskDate: '2026-09-06', nazemManaged: true, track: 'memorization',
        fromPage: id, toPage: id, fromSurah: 2, toSurah: 2, fromAyah: id, toAyah: id + 1,
        targetPages: 0.25, expectedLinkCount: 7, amount: 'مقدار يجب إخفاؤه', teacherCompleted: null }));
      const evaluation = { date: '2026-09-06', tasks, taskQueue: tasks, students: [{ studentId: 99, studentName: 'طالب تجريبي', attendanceStatus: 'present', nazemManaged: true }],
        evaluationModes: { link: 'mushaf' }, executionSources: { link: 'teacher' }, evaluationPolicies: {} };
      const populatedEvaluation = { ...evaluation };
      await context.addInitScript(() => {
        globalThis.localStorage.setItem('wajeh_role', 'supervisor');
        globalThis.localStorage.setItem('wajeh_supervisor_id', '990');
        globalThis.localStorage.setItem('madarij_web_session', '1');
      });
      await context.route('**/api/**', async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (path.endsWith('/offline-recitation/batch')) {
          await route.fulfill({ status: 404, json: { message: 'Batch endpoint unavailable in this compatibility fixture.' } });
          return;
        }
        if (request.method() === 'POST' && /quran-evaluation\/\d+$/.test(path)) submitted.push(request.postDataJSON());
        if (path.endsWith('/quran-evaluation')) {
          evaluationRequests += 1;
          if (evaluationGate) await evaluationGate;
          if (evaluationFails) {
            await route.fulfill({ status: 504, json: { message: 'استغرق الاتصال وقتًا أطول من المتوقع. أعد المحاولة.' } });
            return;
          }
        }
        await route.fulfill({ json: path.endsWith('/quran-evaluation') ? evaluation
          : path.endsWith('/chapters') ? [] : { ok: true, ayahs: [], words: [] } });
      });
      await page.goto('http://127.0.0.1:3000/tests/fixtures/nazem-recitation-policy.html');
      await page.getByRole('alert').waitFor();
      assert.equal(await page.getByText('لا توجد مهام للتقييم.', { exact: true }).count(), 0);
      const retry = page.getByRole('button', { name: 'إعادة المحاولة', exact: true });
      const retryBox = await retry.boundingBox();
      assert.ok(retryBox.height >= 44);
      assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
      if (engineName === 'webkit' && width === 360) await page.screenshot({ path: 'outputs/recitation-load-error-phone.png' });
      evaluationFails = false;
      phase = 'retry';
      await retry.click();
      await page.getByRole('button', { name: 'ربط', exact: true }).waitFor();
      await page.waitForFunction(async () => {
        return Boolean(await globalThis.recitationFixture.getCachedTeacherEvaluation('990'));
      });
      let releaseEvaluation;
      evaluationGate = new Promise((resolve) => { releaseEvaluation = resolve; });
      const beforeReload = evaluationRequests;
      phase = 'cached reload';
      await page.reload();
      await page.getByRole('button', { name: 'ربط', exact: true }).waitFor();
      // Cached tasks appear while the network request is still held. Multiple consumers share it.
      const overlappingLoads = page.evaluate(async () => {
        globalThis.dispatchEvent(new globalThis.Event('focus'));
        return Promise.allSettled([
          globalThis.recitationFixture.load('990'),
          globalThis.recitationFixture.load('990'),
        ]);
      }).catch((error) => ({ error: error.message }));
      await page.waitForTimeout(150);
      assert.equal(evaluationRequests - beforeReload, 1);
      evaluationFails = true;
      releaseEvaluation();
      evaluationGate = null;
      assert.ok(Array.isArray(await overlappingLoads));
      await page.getByRole('alert').waitFor();
      assert.ok(await page.getByRole('button', { name: 'ربط', exact: true }).isVisible());
      assert.equal(await page.getByText('لا توجد مهام للتقييم.', { exact: true }).count(), 0);
      evaluationFails = false;
      phase = 'empty response';
      evaluation.tasks = [];
      evaluation.taskQueue = [];
      evaluation.students = [];
      await retry.click();
      await page.getByText('لا توجد مهام للتقييم.', { exact: true }).waitFor();
      evaluationFails = true;
      phase = 'empty cache reload failure';
      await page.reload();
      await page.getByRole('alert').waitFor();
      assert.equal(await page.getByText('لا توجد مهام للتقييم.', { exact: true }).count(), 0);
      Object.assign(evaluation, populatedEvaluation);
      evaluationFails = false;
      phase = 'count submission';
      await retry.click();
      await page.getByRole('alert').waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: 'ربط', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      assert.equal(await dialog.getByRole('spinbutton').count(), 2);
      assert.equal(await dialog.getByText('مقدار يجب إخفاؤه').count(), 0);
      assert.equal(await dialog.getByText(/المقطع/).count(), 0);
      await dialog.getByRole('spinbutton', { name: 'عدد الأخطاء', exact: true }).fill('5');
      await dialog.getByRole('spinbutton', { name: 'عدد التنبيهات', exact: true }).fill('2');
      await dialog.getByRole('button', { name: 'إنهاء', exact: true }).click();
      await page.waitForFunction(() => !globalThis.document.querySelector('[role="dialog"]'));
      for (let attempt = 0; attempt < 40 && submitted.length < 2; attempt += 1) await page.waitForTimeout(100);
      assert.equal(submitted.length, 2);
      assert.deepEqual(submitted.map((value) => value.evaluationMode), ['count', 'count']);
      assert.equal(submitted.reduce((total, value) => total + value.mistakeCount, 0), 5);
      assert.equal(submitted.reduce((total, value) => total + value.warningCount, 0), 2);
      assert.ok(submitted.every((value) => value.expectedNazemLinkCount === 7));
      await page.waitForLoadState('networkidle');
      assert.deepEqual(errors, [], `${engineName} at ${width}px`);
      results.push({ engine: engineName, width, passed: true, loadingFailureRetry: true, cachedWhileLoading: true, sharedRequest: true });
      await context.close();
    }
  } finally { await browser.close(); }
}
await writeFile('outputs/nazem-recitation-browser.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
