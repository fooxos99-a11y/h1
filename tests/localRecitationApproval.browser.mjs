import assert from 'node:assert/strict';
import process from 'node:process';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const origin = process.env.RECITATION_TEST_UI_URL || 'http://127.0.0.1:3032';
assert.equal(new globalThis.URL(origin).hostname, '127.0.0.1');
await mkdir('outputs/local-recitation-approval-fix', { recursive: true });
for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch({ headless: true });
  try {
    for (const width of [360, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const open = async () => {
        await page.goto(`${origin}/tests/fixtures/local-recitation.html`, { waitUntil: 'domcontentloaded' });
        await page.getByRole('button', { name: 'حفظ', exact: true }).waitFor();
      };
      await open();
      await page.getByRole('button', { name: 'حفظ', exact: true }).click();
      const negativeMemorization = page.getByRole('button', { name: 'لم يتم الحفظ', exact: true });
      await negativeMemorization.waitFor();
      await page.evaluate(() => { globalThis.localRecitationFixture.delaySync = true; });
      await negativeMemorization.click();
      await page.waitForFunction(() => typeof globalThis.localRecitationFixture.releaseSync === 'function');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      assert.notEqual(await page.evaluate(() => globalThis.localRecitationFixture.commits[0].status), 'synced');
      assert.equal(await page.getByRole('button', { name: 'حفظ', exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'مراجعة', exact: true }).isEnabled(), true);
      await page.getByText('لم يتم الحفظ', { exact: true }).waitFor();
      assert.equal(await page.getByText('حُفظت النتيجة', { exact: true }).count(), 0);
      await page.evaluate(() => {
        globalThis.localRecitationFixture.delaySync = false;
        globalThis.localRecitationFixture.releaseSync();
      });
      await page.waitForFunction(() => globalThis.localRecitationFixture.commits[0].status === 'synced');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      assert.ok(await page.evaluate(() => globalThis.localRecitationFixture.commits[0].tasks.every(item =>
        item.payload.notMemorized === true && item.result.teacherCompleted === false && item.result.evaluationScore === 0)));
      await page.getByRole('button', { name: 'مراجعة', exact: true }).click();
      await page.getByRole('button', { name: 'لم تتم المراجعة', exact: true }).click();
      await page.waitForFunction(() => globalThis.localRecitationFixture.commits[1].status === 'synced');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      assert.ok(await page.evaluate(() => globalThis.localRecitationFixture.commits[1].tasks.every(item =>
        item.taskType === 'review' && item.result.teacherCompleted === false && item.result.evaluationScore === 0)));
      await page.getByText('لم يتم الحفظ', { exact: true }).waitFor();
      await page.getByText('لم تتم المراجعة', { exact: true }).waitFor();
      assert.equal(await page.getByText('لا يوجد مقدار للتسميع', { exact: true }).count(), 0);
      assert.equal(await page.getByText('اكتمل التسميع', { exact: true }).count(), 0);

      await open();
      await page.evaluate(() => { globalThis.localRecitationFixture.delaySync = true; });
      await page.getByRole('button', { name: 'حفظ', exact: true }).click();
      await page.getByRole('button', { name: 'إنهاء', exact: true }).click();
      await page.waitForFunction(() => typeof globalThis.localRecitationFixture.releaseSync === 'function');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      assert.notEqual(await page.evaluate(() => globalThis.localRecitationFixture.commits[0].status), 'synced');
      await page.getByRole('button', { name: 'مراجعة', exact: true }).click();
      await page.getByRole('button', { name: 'لم تتم المراجعة', exact: true }).waitFor();
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.evaluate(() => {
        globalThis.localRecitationFixture.delaySync = false;
        globalThis.localRecitationFixture.releaseSync();
      });
      await page.waitForFunction(() => globalThis.localRecitationFixture.commits[0].status === 'synced');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      assert.equal(await page.getByRole('button', { name: 'حفظ', exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'مراجعة', exact: true }).count(), 1);
      assert.equal(await page.getByText('حُفظت النتيجة', { exact: true }).count(), 0);

      await open();
      await page.evaluate(() => { globalThis.localRecitationFixture.rejectSync = true; });
      await page.getByRole('button', { name: 'حفظ', exact: true }).click();
      await page.getByRole('button', { name: 'إنهاء', exact: true }).click();
      await page.waitForFunction(() => globalThis.localRecitationFixture.commits[0].status === 'conflict');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: 'حفظ', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => globalThis.localRecitationFixture.commits.length), 1);
      assert.equal(await page.getByText('حُفظت النتيجة', { exact: true }).count(), 0);
      await page.screenshot({ path: `outputs/local-recitation-approval-fix/${name}-${width}.png` });
      assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));

      await open();
      await page.evaluate(() => { globalThis.localRecitationFixture.failCommit = true; });
      await page.getByRole('button', { name: 'حفظ', exact: true }).click();
      await page.getByRole('button', { name: 'إنهاء', exact: true }).click();
      await page.waitForFunction(() => !globalThis.document.querySelector('[role="dialog"] button:disabled'));
      assert.equal(await page.getByRole('dialog').count(), 1, 'Storage failure must retain the editor');
      assert.equal(await page.evaluate(() => globalThis.localRecitationFixture.commits.length), 0);
      await page.evaluate(() => { globalThis.localRecitationFixture.failCommit = false; });
      await page.getByRole('button', { name: 'إنهاء', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.waitForFunction(() => globalThis.localRecitationFixture.commits[0]?.status === 'synced');

      await open();
      await page.evaluate(() => { globalThis.localRecitationFixture.failSync = true; });
      await page.getByRole('button', { name: 'حفظ', exact: true }).click();
      await page.getByRole('button', { name: 'إنهاء', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.waitForFunction(() => globalThis.localRecitationFixture.commits[0]?.status === 'failed');
      assert.ok(await page.evaluate(() => globalThis.localRecitationFixture.commits[0].tasks.every(item => !item.synced)));
      assert.equal(await page.getByRole('button', { name: 'مراجعة', exact: true }).isEnabled(), true);

      await page.goto(`${origin}/tests/fixtures/local-recitation.html?finishedDaily=1`, { waitUntil: 'domcontentloaded' });
      await page.getByText('اكتمل التسميع', { exact: true }).waitFor();
      assert.equal(await page.getByText('لا يوجد مقدار للتسميع', { exact: true }).count(), 0);
      await page.screenshot({ path: `outputs/local-recitation-approval-fix/${name}-${width}-finished.png` });
      await page.getByRole('button', { name: 'التعويض', exact: true }).click();
      await page.getByRole('dialog').waitFor();
      await page.getByRole('dialog').screenshot({ path: `outputs/local-recitation-approval-fix/${name}-${width}-compensation.png` });
      const bounds = await page.getByRole('dialog').boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, 'Compensation dialog stays inside the viewport');

      await open();
      await context.setOffline(true);
      await page.getByRole('button', { name: 'حفظ', exact: true }).click();
      await page.getByRole('button', { name: 'إنهاء', exact: true }).click();
      await page.waitForFunction(() => globalThis.localRecitationFixture.commits.length === 1);
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      assert.equal(await page.evaluate(() => globalThis.localRecitationFixture.commits[0].status), 'pending');
      assert.ok(await page.evaluate(() => globalThis.localRecitationFixture.commits[0].tasks.every(item => !item.synced)));
      await context.setOffline(false);
      assert.deepEqual(errors, []);
      process.stdout.write(`${name} ${width}: immediate close, background approval, zero scores, rejection, storage/network failure, compensation and offline save passed.\n`);
      await context.close();
    }
  } finally { await browser.close(); }
}
