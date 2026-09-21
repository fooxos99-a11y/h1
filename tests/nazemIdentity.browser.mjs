import assert from 'node:assert/strict';
import { URL } from 'node:url';
import { chromium, webkit } from 'playwright';
import { writeFile } from 'node:fs/promises';

const results = [];
for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch();
  try {
    for (const width of [360, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await context.addInitScript(() => {
        globalThis.localStorage.setItem('wajeh_role', 'supervisor');
        globalThis.localStorage.setItem('wajeh_supervisor_id', '990');
        globalThis.localStorage.setItem('madarij_web_session', '1');
      });
      const task = { id: 373699, planId: 1, planVersion: 1, studentId: 13, studentName: 'عبدالعزيز البراك',
        taskType: 'review', track: 'memorization', taskDate: '2026-09-06', nazemManaged: true,
        fromPage: 567, toPage: 568, fromSurah: 69, fromAyah: 9, toSurah: 69, toAyah: 35,
        targetPages: 2, teacherCompleted: null };
      const data = { date: '2026-09-06', tasks: [task], taskQueue: [task],
        students: [{ studentId: 13, studentName: task.studentName, nazemManaged: true, attendanceStatus: 'present',
          recitationSyncFailed: true, recitationSyncErrorCode: 'NAZEM_FOLLOW_UP_STUDENT_MISSING' }],
        evaluationModes: { review: 'count' }, executionSources: { review: 'teacher' }, evaluationPolicies: {} };
      await context.route('**/api/**', (route) => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/quran-evaluation')
        ? data : { ok: true, ayahs: [], words: [] } }));
      await page.goto('http://127.0.0.1:3000/tests/fixtures/nazem-recitation-policy.html');
      await page.getByText('الطالب غير ظاهر في متابعة ناظم', { exact: true }).waitFor();
      assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
      await page.getByRole('button', { name: 'مراجعة', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      assert.equal(await dialog.getByRole('spinbutton').count(), 2);
      assert.equal(await dialog.getByText('المقطع 2', { exact: true }).count(), 0);
      await dialog.evaluate(async (element) => { await Promise.all(element.getAnimations().map((animation) => animation.finished)); });
      const box = await dialog.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width, JSON.stringify({ engineName, width, box }));
      const finish = await dialog.getByRole('button', { name: 'إنهاء', exact: true }).boundingBox();
      assert.ok(finish.height >= 44);
      if (engineName === 'webkit' && width === 360) await page.screenshot({ path: 'outputs/nazem-review-identity-phone.png' });
      assert.deepEqual(errors, []);
      results.push({ engine: engineName, width, passed: true, reviewCount: 1, causeVisible: true });
      await context.close();
    }
  } finally { await browser.close(); }
}
await writeFile('outputs/nazem-identity-browser.json', JSON.stringify(results, null, 2));
