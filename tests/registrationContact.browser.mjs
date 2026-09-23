import assert from 'node:assert/strict';
import process from 'node:process';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    let sent = null;
    await page.route('**/api/registration/public**', route => route.fulfill({ json: { enabled: width !== 360, juzRanges: [] } }));
    await page.route('**/api/contact-messages', route => {
      sent = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: { id: 1, linkedAccount: false } });
    });
    await page.goto(`${process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3018'}/tests/fixtures/registration-contact.html?registrationNumber=1234`);
    await page.getByRole('button', { name: 'تواصل معنا', exact: true }).click();
    await page.getByLabel('الاسم', { exact: true }).fill('ولي أمر طالب');
    await page.getByLabel('موضوع الرسالة', { exact: true }).fill('أرغب بالاستفسار عن موعد التسجيل');
    assert.ok(await page.getByRole('dialog').evaluate(node => node.scrollWidth <= node.clientWidth));
    await page.screenshot({ path: `outputs/registration-contact-${width}.png` });
    await page.getByRole('button', { name: 'إرسال', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert.equal(sent.registrationNumber, '1234');
    assert.equal(sent.subject, 'أرغب بالاستفسار عن موعد التسجيل');
    assert.equal(sent.name, 'ولي أمر طالب');
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    await page.close();
  }
} finally { await browser.close(); }
