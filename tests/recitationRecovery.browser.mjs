import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import process from 'node:process';
import { chromium, webkit } from 'playwright';

const base = process.env.QURAN_TEST_API_URL;
assert.equal(new globalThis.URL(base).hostname, '127.0.0.1');
const fixture = JSON.parse(await readFile('outputs/recitation-recovery/fixture.json', 'utf8'));
const login = await globalThis.fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json',
  'X-Madarij-Native': '1', 'X-Registration-Number': fixture.registration },
body: JSON.stringify({ loginNumber: fixture.teacherLogin, registrationNumber: fixture.registration }) });
assert.equal(login.status, 200);
const teacher = await login.json();
const evidence = [];
await mkdir('outputs/recitation-recovery', { recursive: true });
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    for (const width of [360, 768, 1440]) for (const mode of ['normal', 'draft-read-failure', 'draft-corrupt', 'draft-write-failure', 'reports']) {
      process.stdout.write(`${engine.name()} ${width} ${mode}\n`);
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      let healthUnavailable = false;
      await page.route('**/api/**', async route => {
        const incoming = new globalThis.URL(route.request().url());
        if (incoming.pathname.endsWith('/health') && healthUnavailable) return route.fulfill({ status: 503, json: { message: 'temporary test outage' } });
        const suffix = incoming.pathname.slice(incoming.pathname.indexOf('/api') + 4);
        const response = await route.fetch({ url: `${base}${suffix}${incoming.search}`,
          headers: { ...route.request().headers(), Authorization: `Bearer ${teacher.token}`,
            'X-Madarij-Native': '1', 'X-Registration-Number': fixture.registration } });
        await route.fulfill({ response });
      });
      await page.goto(`http://127.0.0.1:3011/tests/fixtures/recitation-recovery.html?teacher=${teacher.id}&registration=${fixture.registration}&mode=${mode}`);
      if (mode === 'reports') {
        await page.getByRole('region', { name: 'مؤشرات الأداء' }).waitFor();
      } else {
        if (mode === 'normal') {
          await page.getByRole('button', { name: 'ربط', exact: true }).first().click();
          const negativeLink = page.getByRole('dialog').getByRole('button', { name: 'لم يتم الربط', exact: true });
          await negativeLink.waitFor();
          await page.waitForFunction(() => [...globalThis.document.querySelectorAll('[role="dialog"] button')]
            .find(button => button.textContent.trim() === 'لم يتم الربط')?.disabled === false);
          await page.screenshot({ path: `outputs/recitation-recovery/${engine.name()}-${width}-link-option.png`, fullPage: true });
          await page.getByRole('dialog').getByRole('button', { name: 'إغلاق', exact: true }).click();
        }
        await page.getByRole('button', { name: 'مراجعة', exact: true }).first().click();
        const dialog = page.getByRole('dialog');
        const submit = dialog.getByRole('button', { name: 'إنهاء', exact: true });
        await dialog.waitFor();
        if (['draft-read-failure', 'draft-corrupt'].includes(mode)) {
          await dialog.getByRole('alert').waitFor();
          assert.equal(await submit.isEnabled(), false);
          assert.equal(await dialog.getByRole('button', { name: 'لم تتم المراجعة', exact: true }).isEnabled(), false);
          await page.screenshot({ path: `outputs/recitation-recovery/${engine.name()}-${width}-${mode}-error.png`, fullPage: true });
          await page.evaluate(() => globalThis.recitationRecoveryFixture.recover());
          await dialog.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
          await submit.waitFor({ state: 'visible' });
        }
        await page.waitForFunction(() => [...globalThis.document.querySelectorAll('[role="dialog"] button')]
          .find(button => button.textContent.trim() === 'إنهاء')?.disabled === false);
        await dialog.getByRole('button', { name: 'زيادة عدد الأخطاء' }).first().click();
        await dialog.getByRole('button', { name: 'زيادة عدد الأخطاء' }).first().click();
        const mistakes = dialog.getByRole('spinbutton', { name: 'عدد الأخطاء' }).first();
        assert.equal(await mistakes.inputValue(), '2');
        if (mode === 'draft-write-failure') {
          await dialog.getByRole('alert').waitFor();
          assert.equal(await submit.isEnabled(), false);
          await page.screenshot({ path: `outputs/recitation-recovery/${engine.name()}-${width}-${mode}-error.png`, fullPage: true });
          await page.evaluate(() => globalThis.recitationRecoveryFixture.recover());
          await dialog.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
          await dialog.getByRole('alert').waitFor({ state: 'hidden' });
          assert.equal(await mistakes.inputValue(), '2');
        }
        if (mode === 'normal') {
          healthUnavailable = true;
          await page.evaluate(() => globalThis.dispatchEvent(new globalThis.Event('madarij-app-resumed')));
          await page.waitForTimeout(300);
          assert.equal(await dialog.isVisible(), true);
          assert.equal(await mistakes.inputValue(), '2');
          assert.equal(await page.evaluate(() => globalThis.recitationRecoveryFixture.mounts), 1);
          await page.screenshot({ path: `outputs/recitation-recovery/${engine.name()}-${width}-resume-dialog.png`, fullPage: true });
        }
        await dialog.getByRole('button', { name: 'إغلاق', exact: true }).click();
      }
      assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.document.documentElement.clientWidth), true);
      assert.deepEqual(errors, []);
      const screenshot = `outputs/recitation-recovery/${engine.name()}-${width}-${mode}.png`;
      await page.screenshot({ path: screenshot, fullPage: true });
      evidence.push({ engine: engine.name(), width, mode, overflow: false, errors: [] });
      await context.close();
    }
  } finally { await browser.close(); }
}
await writeFile('outputs/recitation-recovery/browser-evidence.json', JSON.stringify(evidence, null, 2));
process.stdout.write(`${evidence.length} real local API/browser scenarios passed Chromium/WebKit at 360/768/1440px.\n`);
