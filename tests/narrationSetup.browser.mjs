import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch();
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto((globalThis.process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3017') + '/tests/fixtures/narration-setup.html');
    const first = page.getByRole('checkbox', { name: 'اختيار طالب مرتبط' });
    const second = page.getByRole('checkbox', { name: 'اختيار طالب مستقل' });
    await first.waitFor();
    assert.equal(await second.isDisabled(), true);
    assert.equal(await page.getByText('حلقة أخرى', { exact: true }).count(), 0);
    await first.check();
    await page.getByRole('button', { name: 'فتح', exact: true }).click();
    assert.equal((await page.evaluate(() => globalThis.narrationSetupFixture.saves[0])).selections.length, 1);
    await page.getByRole('combobox', { name: 'طريقة السرد' }).click();
    await page.getByRole('option', { name: 'يدوي', exact: true }).click();
    assert.equal(await first.isChecked(), false);
    assert.equal(await second.isDisabled(), false);
    await first.focus(); await first.press('Space');
    await second.check();
    await page.getByRole('spinbutton', { name: 'عدد الأوجه للطالب طالب مرتبط' }).fill('13');
    await page.getByRole('spinbutton', { name: 'عدد الأوجه للطالب طالب مستقل' }).fill('10');
    await page.getByRole('combobox', { name: 'بدء الجزء للطالب طالب مرتبط' }).click();
    await page.getByRole('option', { name: 'الجزء 30', exact: true }).click();
    assert.equal(await page.getByRole('spinbutton', { name: 'صفحة البداية للطالب طالب مرتبط' }).inputValue(), '582');
    await page.getByRole('button', { name: 'فتح', exact: true }).click();
    const result = await page.evaluate(() => globalThis.narrationSetupFixture.saves[1]);
    assert.equal(result.mode, 'manual');
    assert.deepEqual(result.selections.map((item) => Number(item.faces)), [13, 10]);
    const dialog = page.getByRole('dialog');
    await dialog.evaluate(async (element) => { await Promise.all(element.getAnimations().map((animation) => animation.finished)); });
    assert.ok(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth));
    assert.equal(await dialog.evaluate((element) => globalThis.getComputedStyle(element).direction), 'rtl');
    assert.deepEqual(errors, []);
    await page.goto((globalThis.process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3017') + '/tests/fixtures/narration-setup.html?fail');
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByRole('button', { name: 'فتح', exact: true }).isDisabled(), true);
    await page.evaluate(() => { globalThis.narrationSetupFixture.fail = false; });
    await page.getByRole('button', { name: 'إعادة المحاولة' }).click();
    await first.waitFor();
    await page.close();
  }
} finally { await browser.close(); }
globalThis.console.log('Narration setup full/manual selection, 13/10 targets, committee filter, keyboard, error/retry and RTL at 360/768/1440 passed.');
