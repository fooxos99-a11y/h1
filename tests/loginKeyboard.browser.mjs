import assert from 'node:assert/strict';
import console from 'node:console';
import { chromium, webkit } from 'playwright';

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    for (const width of [360, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await page.goto('http://127.0.0.1:3018/tests/fixtures/account-ui-revision.html?login');
      const input = page.getByLabel('رقم الحساب');
      await input.press('Enter');
      assert.ok(await input.isVisible(), 'empty number must not submit');
      await input.fill('١٢٣٤');
      assert.equal(await input.inputValue(), '1234');
      await input.press('Tab');
      assert.ok(await input.isVisible(), 'leaving the input must not submit');
      assert.equal(await input.getAttribute('enterkeyhint'), 'done');
      await input.press('Enter');
      await input.waitFor({ state: 'hidden' });
      console.info(`${engine.name()} ${width}: keyboard login passed`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
