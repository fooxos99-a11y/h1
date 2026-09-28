import assert from 'node:assert/strict';
import console from 'node:console';
import { chromium } from 'playwright';

const browser = await chromium.launch();
try {
  for (const width of [360, 768, 1440]) {
    for (const source of ['station', 'program']) {
      const page = await browser.newPage({ viewport: { width, height: 800 }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:3011/tests/fixtures/station-points.html${source === 'program' ? '?program' : ''}`);
      if (source === 'station') {
        assert.equal(await page.getByRole('button', { name: 'تسجيل النقاط', exact: true }).count(), 0);
        await page.getByLabel('نقاط المحطة', { exact: true }).fill('80');
        await page.getByRole('button', { name: 'تفعيل المحطة', exact: true }).click();
        await page.getByRole('button', { name: 'تسجيل النقاط', exact: true }).click();
      }
      const dialog = page.getByRole('dialog');
      await page.getByLabel('نقاط طالب 1', { exact: true }).waitFor();
      await dialog.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
      assert.equal(await dialog.getByText(/المسجل:/).count(), 0);
      const search = page.getByRole('searchbox', { name: 'ابحث باسم الطالب' });
      const filter = page.getByRole('combobox', { name: 'الحلقة', exact: true });
      assert.ok(Math.abs((await search.boundingBox()).y - (await filter.boundingBox()).y) < 2);
      await filter.click();
      await page.getByRole('option', { name: 'حلقة أ', exact: true }).click();
      assert.equal(await page.getByLabel('نقاط طالب 2', { exact: true }).count(), 0);
      await search.fill('3');
      assert.equal(await page.getByLabel('نقاط طالب 1', { exact: true }).count(), 0);
      await page.getByRole('checkbox', { name: 'تحديد الكل', exact: true }).check();
      await page.getByLabel('نقاط المحددين', { exact: true }).fill('60');
      await page.getByRole('button', { name: 'حفظ', exact: true }).click();
      await page.waitForFunction(() => globalThis.document.querySelector('output').textContent !== '[]');
      assert.deepEqual(JSON.parse(await page.getByLabel('الدفعة المحفوظة').textContent()), [{ studentId: 3, points: 60 }]);
      assert.ok(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth));
      const name = await page.getByRole('checkbox', { name: 'تحديد طالب 3', exact: true }).boundingBox();
      const input = await page.getByLabel('نقاط طالب 3', { exact: true }).boundingBox();
      assert.ok(Math.abs(name.y - input.y) < 2, 'Student name and points must share a row');
      await page.screenshot({ path: `outputs/${source}-points-${width}.png` });
      await page.getByRole('button', { name: 'إغلاق', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(`Station and program points: ${width}px passed`);
  }
} finally { await browser.close(); }
