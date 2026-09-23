import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    let writes = 0;
    await page.route('**/api/programs/1', route => {
      writes++;
      return route.fulfill({ json: { success: true } });
    });
    await page.goto('http://127.0.0.1:3017/tests/fixtures/dashboard-undo.html');
    await page.getByRole('button', { name: 'حذف البرنامج' }).click();
    const undo = page.getByRole('button', { name: 'تراجع', exact: true });
    await undo.waitFor();
    const box = await undo.boundingBox();
    assert.ok(box.height >= 44 && box.x >= 0 && box.x + box.width <= width);
    assert.equal(writes, 0, 'No network mutation during undo window');
    if (width === 768) await page.keyboard.press('Control+z');
    else await undo.click();
    await page.getByText('تم التراجع عن الأمر', { exact: true }).waitFor();
    assert.equal(writes, 0, 'Undo must not send a request');
    if (width === 360) {
      await page.getByRole('button', { name: 'حذف البرنامج' }).click();
      await page.getByText('نفذ', { exact: true }).waitFor({ timeout: 15_000 });
      assert.equal(writes, 1, 'Only the uncancelled command is sent after ten seconds');
    }
    await page.close();
  }
} finally { await browser.close(); }
