import assert from 'node:assert/strict';
import console from 'node:console';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 800 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const metric of ['students', 'studentPoints']) {
      await page.goto(`http://127.0.0.1:3018/tests/fixtures/metric-details.html?metric=${metric}`);
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      await dialog.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
      const measure = () => dialog.evaluate(element => {
        const box = element.getBoundingClientRect();
        const header = element.firstElementChild;
        const body = element.lastElementChild;
        return {
          width: box.width, left: box.left, right: box.right, top: box.top, bottom: box.bottom,
          overflow: element.scrollWidth - element.clientWidth,
          bodyOverflow: body.scrollWidth - body.clientWidth,
          headerTop: header.getBoundingClientRect().top,
          closeVisible: header.lastElementChild.getBoundingClientRect().left >= box.left,
          direction: globalThis.getComputedStyle(element).direction,
        };
      });
      const initial = await measure();
      assert.ok(initial.left >= 0 && initial.right <= width && initial.top >= 0 && initial.bottom <= 800, JSON.stringify(initial));
      assert.ok(initial.overflow <= 1 && initial.bodyOverflow <= 1, JSON.stringify(initial));
      assert.equal(initial.closeVisible, true);
      assert.equal(initial.direction, 'rtl');
      await dialog.evaluate(element => { element.lastElementChild.scrollTop = 600; });
      assert.equal((await measure()).headerTop, initial.headerTop);
      if (metric === 'studentPoints') {
        await dialog.evaluate(element => { element.lastElementChild.scrollTop = 0; });
        await page.getByRole('combobox', { name: 'الطالب', exact: true }).click();
        await page.getByRole('option', { name: 'طالب الاختبار ذو الاسم الطويل 1', exact: true }).click();
        await page.getByText('الرصيد الكلي', { exact: true }).waitFor();
        const selected = await measure();
        assert.ok(selected.overflow <= 1 && selected.bodyOverflow <= 1, JSON.stringify(selected));
        await page.screenshot({ path: `outputs/metric-details-${width}.png` });
      }
      await page.getByRole('button', { name: 'إغلاق', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
    }
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`Metric details: ${width}px passed`);
  }
} finally {
  await browser.close();
}
