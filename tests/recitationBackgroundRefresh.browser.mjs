import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import process from 'node:process';
import { URL } from 'node:url';

const base = process.env.RECITATION_BACKGROUND_BASE || 'http://127.0.0.1:3027';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Synthetic recitation tests require loopback.');
const output = 'outputs/recitation-background-refresh';
await mkdir(output, { recursive: true });
const evidence = [];

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    for (const width of [360, 768, 1440]) {
      for (const fail of [false, true, 403]) {
        const page = await browser.newPage({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
        const errors = [];
        let navigations = 0;
        page.on('pageerror', error => errors.push(error.message));
        page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
        await page.addInitScript(() => {
          globalThis.localStorage.setItem('wajeh_role', 'supervisor');
          globalThis.localStorage.setItem('wajeh_supervisor_id', '990');
        });
        await page.route('**/api/**', route => route.abort('blockedbyclient'));
        page.setDefaultTimeout(15000);
        await page.goto(`${base}/tests/fixtures/local-recitation.html?backgroundRefresh`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        const card = id => page.locator('.recitation-reference-card').filter({ has: page.getByText(`طالب متابعة ${id}`, { exact: true }) });
        const next = card(41);
        await card(40).getByRole('button', { name: 'حفظ', exact: true }).waitFor();
        await card(40).evaluate(node => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
        assert.ok(await page.evaluate(() => globalThis.scrollY) > 100, 'The test must start partway down the roster.');
        const stableRow = await next.elementHandle();
        const cacheWrites = await page.evaluate(() => globalThis.localRecitationFixture.cacheWrites);
        await card(40).getByRole('button', { name: 'حفظ', exact: true }).click();
        const dialog = page.getByRole('dialog');
        const mistakes = dialog.getByRole('spinbutton', { name: 'عدد الأخطاء' });
        await mistakes.fill('2');
        assert.equal(await page.evaluate(() => globalThis.localRecitationFixture.evaluationCalls), 1, 'Typing must not fetch the session.');
        await page.evaluate(value => {
          globalThis.localRecitationFixture.delayEvaluation = true;
          globalThis.localRecitationFixture.failEvaluation = value;
        }, fail);
        await dialog.getByRole('button', { name: 'إنهاء', exact: true }).click();
        await dialog.waitFor({ state: 'detached' });
        await page.waitForFunction(() => Boolean(globalThis.localRecitationFixture.releaseEvaluation));
        const scrollBefore = await page.evaluate(() => globalThis.scrollY);
        assert.ok(scrollBefore > 100, 'The saved student must be below the first viewport.');
        assert.equal(await page.locator('[data-loading-indicator]').count(), 0, 'Background approval must keep the list mounted.');
        assert.equal(await stableRow.evaluate(node => node.isConnected), true);
        await next.getByRole('button', { name: 'حفظ', exact: true }).click();
        await mistakes.fill('3');
        await page.evaluate(() => globalThis.localRecitationFixture.releaseEvaluation());
        if (fail === 403) {
          await dialog.waitFor({ state: 'detached' });
          await page.getByText('فشل قراءة الجلسة التجريبي', { exact: true }).waitFor();
          assert.equal(await page.locator('.recitation-reference-card').count(), 0, 'Revoked access must remove account data and the open student form.');
          assert.equal(navigations, 1);
          assert.deepEqual(errors, []);
          await page.screenshot({ path: `${output}/${engine.name()}-${width}-denied.png` });
          evidence.push({ engine: engine.name(), width, scenario: 'denied', accountDataHidden: true, dialogClosed: true, navigations, errors });
          process.stdout.write(`${JSON.stringify(evidence.at(-1))}\n`);
          await page.context().close();
          continue;
        }
        if (fail) await page.getByText('فشل قراءة الجلسة التجريبي', { exact: true }).waitFor();
        else await page.waitForFunction(value => globalThis.localRecitationFixture.cacheWrites > value, cacheWrites);
        assert.equal(await stableRow.evaluate(node => node.isConnected), true, 'Fresh data must retain the existing list DOM.');
        assert.equal(await mistakes.inputValue(), '3', 'Refreshing another result must not reset the open student draft.');
        assert.equal(await page.locator('[data-loading-indicator]').count(), 0);
        await dialog.getByRole('button', { name: 'إغلاق', exact: true }).click();
        await dialog.waitFor({ state: 'detached' });
        const scrollAfter = await page.evaluate(() => globalThis.scrollY);
        if (!fail) assert.ok(Math.abs(scrollAfter - scrollBefore) < 3, 'Saving must preserve the scroll position.');
        else {
          assert.ok(scrollAfter > 100, 'A temporary error must not reset the page to the top.');
          await page.evaluate(() => { globalThis.localRecitationFixture.failEvaluation = false; });
          await page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
          await page.getByText('فشل قراءة الجلسة التجريبي', { exact: true }).waitFor({ state: 'hidden' });
          assert.equal(await next.count(), 1);
        }
        assert.equal(navigations, 1, 'Saving must not navigate or reload the document.');
        assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth), true);
        assert.deepEqual(errors, []);
        const scenario = fail ? 'retry' : 'saved';
        await page.screenshot({ path: `${output}/${engine.name()}-${width}-${scenario}.png` });
        evidence.push({ engine: engine.name(), width, scenario, scrollBefore, scrollAfter, typingRefetched: false,
          listStayedMounted: true, nextStudentDraftPreserved: true, navigations, errors });
        process.stdout.write(`${JSON.stringify(evidence.at(-1))}\n`);
        await page.context().close();
      }
    }
  } finally {
    await browser.close();
  }
}
await writeFile(`${output}/browser-evidence.json`, JSON.stringify(evidence, null, 2));
