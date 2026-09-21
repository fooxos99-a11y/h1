import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  for (const width of [360, 768, 1440]) {
    for (const linked of [true, false]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    await page.goto(`http://127.0.0.1:3003/tests/fixtures/nazem-link-visible.html?linked=${linked}`);
    const link = page.getByRole('button', { name: 'ربط', exact: true });
    await link.waitFor();
    assert.equal(await link.isEnabled(), true);
    assert.equal(await page.getByRole('button', { name: 'حفظ', exact: true }).isVisible(), true);
    await link.click();
    assert.equal(await page.locator('#result').textContent(), 'clicked');
    assert.ok(await page.locator('html').evaluate((element) => element.scrollWidth <= element.ownerDocument.defaultView.innerWidth));
    await page.screenshot({ path: `outputs/nazem-link-visible-${linked}-${width}.png` });
    await page.close();
    }
  }
} finally { await browser.close(); }
