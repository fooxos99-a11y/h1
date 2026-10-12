import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';

const base = process.env.PROGRAM_ATTACHMENT_TEST_URL || 'http://127.0.0.1:3019/tests/fixtures/program-attachments.html';
const png = await sharp({ create: { width: 800, height: 400, channels: 3, background: '#008577' } }).png().toBuffer();
const pdf = await new Promise(resolve => {
  const document = new PDFDocument(); const chunks = [];
  document.on('data', chunk => chunks.push(chunk)); document.on('end', () => resolve(Buffer.concat(chunks)));
  document.rect(50, 50, 400, 200).fill('#c24b3e'); document.fillColor('black').text('FIRST PAGE', 50, 300);
  document.addPage().rect(50, 50, 400, 200).fill('#003d52'); document.fillColor('black').text('SECOND PAGE', 50, 300); document.end();
});
const file = (name, mimeType, buffer) => ({ name, mimeType, buffer });
const attachment = (name, mime, bytes) => ({ type: 'file', fileName: name, mimeType: mime, value: `data:${mime};base64,${bytes.toString('base64')}` });
const program = { id: 1, title: 'برنامج المرفقات', pointsReward: 10, status: 'open', contents: [attachment('parent.pdf', 'application/pdf', pdf)], questions: [], sectionsEnabled: true,
  sections: [{ id: 2, title: 'درس المرفقات', pointsReward: 10, status: 'open', contents: [attachment('original.pdf', 'application/pdf', pdf)],
    questions: [{ id: 1, text: 'سؤال', options: [{ id: 1, text: 'صحيح', isCorrect: true }, { id: 2, text: 'خطأ', isCorrect: false }] }] }] };
await mkdir('outputs', { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [360, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ program }) => {
      if (!globalThis.localStorage.getItem('program_attachment_fixture')) globalThis.localStorage.setItem('program_attachment_fixture', JSON.stringify(program));
      const Reader = globalThis.FileReader;
      globalThis.FileReader = class extends Reader {
        readAsDataURL(file) {
          if (file.name === 'broken.pdf') { globalThis.setTimeout(() => this.onerror?.(new globalThis.ProgressEvent('error')), 50); return; }
          globalThis.setTimeout(() => super.readAsDataURL(file), file.name === 'slow.png' ? 700 : 150);
        }
      };
    }, { program });
    const enterEditor = async () => {
      await page.goto(base);
      await page.getByRole('button', { name: 'دخول', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'تعديل', exact: true }).click();
      const parent = page.getByRole('dialog', { name: 'تعديل البرنامج', exact: true });
      await parent.getByRole('button', { name: 'تعديل', exact: true }).click();
      return page.getByRole('dialog', { name: 'تعديل القسم', exact: true });
    };
    const save = async child => {
      await child.getByRole('button', { name: 'حفظ', exact: true }).click();
      await child.waitFor({ state: 'hidden' });
      await page.getByRole('dialog', { name: 'تعديل البرنامج', exact: true }).getByRole('button', { name: 'حفظ', exact: true }).click();
      await page.getByRole('dialog', { name: 'تعديل البرنامج', exact: true }).waitFor({ state: 'hidden' });
    };
    let child = await enterEditor();
    await child.locator('input[type=file]').setInputFiles(file('replacement.png', 'image/png', png));
    assert.equal(await child.getByRole('button', { name: 'حفظ', exact: true }).isDisabled(), true);
    await child.getByRole('button', { name: 'replacement.png', exact: true }).waitFor();
    if (width === 360) await page.evaluate(() => { globalThis.failNextProgramReload = true; });
    await save(child);
    // Reopen from the still-open management dialog, where the stale parent previously hid the change.
    await page.getByRole('dialog').getByRole('button', { name: 'تعديل', exact: true }).click();
    await page.getByRole('dialog', { name: 'تعديل البرنامج', exact: true }).getByRole('button', { name: 'تعديل', exact: true }).click();
    child = page.getByRole('dialog', { name: 'تعديل القسم', exact: true });
    assert.equal(await child.getByRole('button', { name: 'original.pdf', exact: true }).count(), 0);
    await child.getByRole('button', { name: 'replacement.png', exact: true }).click();
    const preview = page.getByRole('dialog', { name: 'replacement.png', exact: true });
    await preview.locator('img').waitFor();
    assert.equal(await preview.locator('img').evaluate(img => img.complete && img.naturalWidth === 800), true);
    await preview.getByRole('button', { name: 'إغلاق', exact: true }).click();
    await child.getByRole('button', { name: 'إلغاء', exact: true }).click();
    await page.getByRole('dialog', { name: 'تعديل البرنامج', exact: true }).getByRole('button', { name: 'إلغاء', exact: true }).click();
    await page.goto(`${base}?mode=student`);
    await page.getByRole('button', { name: 'ابدأ', exact: true }).click();
    await page.getByRole('button', { name: 'parent.pdf', exact: true }).click();
    const parentPreview = page.getByRole('dialog', { name: 'parent.pdf', exact: true });
    await parentPreview.locator('canvas').waitFor();
    await page.keyboard.press('Escape');
    await parentPreview.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'ابدأ', exact: true }).click();
    await page.getByRole('button', { name: 'replacement.png', exact: true }).click();
    const imageDialog = page.getByRole('dialog', { name: 'replacement.png', exact: true });
    await page.waitForFunction(() => globalThis.document.querySelector('[role=dialog] img')?.naturalWidth === 800);
    await imageDialog.evaluate(async el => { await Promise.all(el.getAnimations().map(animation => animation.finished)); });
    const imageBounds = await imageDialog.boundingBox();
    assert.ok(imageBounds.x >= 0 && imageBounds.y >= 0 && imageBounds.x + imageBounds.width <= width + 1 && imageBounds.y + imageBounds.height <= 901);
    assert.ok(await imageDialog.evaluate(el => el.scrollWidth <= el.clientWidth));
    await page.screenshot({ path: `outputs/program-attachment-image-${width}.png` });
    await page.keyboard.press('Escape');
    await imageDialog.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => globalThis.document.activeElement?.textContent === 'replacement.png');
    assert.equal(await page.getByRole('button', { name: 'replacement.png', exact: true }).evaluate(el => el === globalThis.document.activeElement), true);
    child = await enterEditor();
    await child.locator('input[type=file]').setInputFiles(file('broken.pdf', 'application/pdf', pdf));
    await child.getByText('تعذرت قراءة الملف.', { exact: true }).waitFor();
    assert.equal(await child.getByRole('button', { name: 'حفظ', exact: true }).isDisabled(), true);
    await child.locator('input[type=file]').setInputFiles(file('slow.png', 'image/png', png));
    await child.getByRole('button', { name: 'حذف الملف', exact: true }).click();
    await page.waitForTimeout(750);
    assert.equal(await child.getByRole('button', { name: 'slow.png', exact: true }).count(), 0);
    assert.equal(await child.getByRole('button', { name: 'replacement.png', exact: true }).count(), 0);
    await child.locator('input[type=file]').setInputFiles(file('slow.png', 'image/png', png));
    await child.locator('input[type=file]').setInputFiles(file('replacement.pdf', 'application/pdf', pdf));
    await child.getByRole('button', { name: 'replacement.pdf', exact: true }).waitFor();
    await page.waitForTimeout(750);
    assert.equal(await child.getByRole('button', { name: 'slow.png', exact: true }).count(), 0);
    await save(child);
    const persisted = await page.evaluate(() => JSON.parse(globalThis.localStorage.getItem('program_attachment_fixture')).sections[0].contents[0]);
    assert.equal(persisted.value, attachment('replacement.pdf', 'application/pdf', pdf).value);
    await page.goto(`${base}?mode=student`);
    await page.getByRole('button', { name: 'ابدأ', exact: true }).click();
    await page.getByRole('button', { name: 'ابدأ', exact: true }).click();
    await page.getByRole('button', { name: 'replacement.pdf', exact: true }).click();
    const pdfDialog = page.getByRole('dialog', { name: 'replacement.pdf', exact: true });
    await pdfDialog.locator('canvas').waitFor();
    await pdfDialog.getByText('FIRST PAGE', { exact: true }).waitFor({ state: 'attached' });
    const pixel = await pdfDialog.locator('canvas').evaluate(canvas => [...canvas.getContext('2d').getImageData(canvas.width / 4, canvas.height / 5, 1, 1).data]);
    assert.ok(pixel[0] > pixel[1] && pixel[0] > pixel[2]);
    await pdfDialog.getByRole('button', { name: 'الصفحة التالية', exact: true }).click();
    await pdfDialog.getByText('SECOND PAGE', { exact: true }).waitFor({ state: 'attached' });
    assert.equal(await pdfDialog.getByRole('alert').count(), 0);
    await pdfDialog.evaluate(async el => { await Promise.all(el.getAnimations().map(animation => animation.finished)); });
    const pdfBounds = await pdfDialog.boundingBox();
    assert.ok(pdfBounds.x >= 0 && pdfBounds.y >= 0 && pdfBounds.x + pdfBounds.width <= width + 1 && pdfBounds.y + pdfBounds.height <= 901);
    assert.ok(await pdfDialog.evaluate(el => el.scrollWidth <= el.clientWidth));
    assert.ok(await pdfDialog.getByRole('button', { name: 'الصفحة السابقة' }).evaluate(el => el.getBoundingClientRect().height >= 44));
    await page.screenshot({ path: `outputs/program-attachment-pdf-${width}.png` });
    await page.keyboard.press('Escape');
    await pdfDialog.waitFor({ state: 'hidden' });
    if (width === 360) {
      await page.evaluate(() => {
        const program = JSON.parse(globalThis.localStorage.getItem('program_attachment_fixture'));
        program.sections[0].contents = [{ type: 'file', fileName: 'invalid.pdf', value: 'data:application/pdf;base64,aW52YWxpZA==' }];
        globalThis.localStorage.setItem('program_attachment_fixture', JSON.stringify(program));
      });
      await page.goto(`${base}?mode=student`);
      await page.getByRole('button', { name: 'ابدأ', exact: true }).click();
      await page.getByRole('button', { name: 'ابدأ', exact: true }).click();
      await page.getByRole('button', { name: 'invalid.pdf', exact: true }).click();
      const invalid = page.getByRole('dialog', { name: 'invalid.pdf', exact: true });
      await invalid.getByRole('alert').waitFor();
      assert.equal(await invalid.getByRole('link', { name: 'تحميل الملف', exact: true }).count(), 1);
      await page.keyboard.press('Escape');
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('Attachment replacement, retained admin state, student image/PDF preview, reader failures and races passed at 360/768/1440px.');
} finally { await browser.close(); }
