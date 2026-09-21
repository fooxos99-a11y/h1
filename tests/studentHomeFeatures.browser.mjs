import { getBusinessDate } from '../shared/business-date.js';
import assert from 'node:assert/strict';
import { URL } from 'node:url';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  for (const enabled of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await context.addInitScript(() => {
      globalThis.localStorage.setItem('wajeh_role', 'student');
      globalThis.localStorage.setItem('wajeh_student_id', '991');
      globalThis.localStorage.setItem('madarij_web_session', '1');
    });
    const page = await context.newPage();
    let programRequests = 0;
    let fail = true;
    let submitted = false;
    let purchased = 0;
    const purchaseIds = new Set();
    let read = false;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await context.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      let body = [];
      if (path.endsWith('/offline-student/bootstrap')) body = { date: getBusinessDate(), store: { enabled: true, storeBalance: 160 - purchased * 75, purchasedToday: purchased, products: [{ id: 3, name: 'منتج اختبار', pointsPrice: 75, stock: 5 }, { id: 4, name: 'منتج مرتفع', pointsPrice: 200, stock: 5 }] } };
      if (path.endsWith('/store/purchase')) {
        const requestId = route.request().postDataJSON().requestId;
        assert.equal(purchaseIds.has(requestId), false);
        purchaseIds.add(requestId);
        assert.equal(route.request().postDataJSON().productId, 3);
        purchased += 1;
        body = { ok: true, storeBalance: 160 - purchased * 75 };
      }
      if (path.endsWith('/notifications')) body = [{ id: 9, title: 'إشعار اختبار', body: 'محتوى الإشعار', isRead: read }];
      if (path.endsWith('/notifications/read')) { assert.deepEqual(route.request().postDataJSON(), { ids: [9] }); read = true; body = { ok: true }; }

      if (path.endsWith('/public-settings')) body = { learningPathsEnabled: enabled, storeEnabled: enabled, pointsSystemEnabled: enabled, hasStudentQuranExecution: false, summitEnabled: false, dailyChallengeEnabled: false };
      if (path.endsWith('/quran-today')) body = { tasks: [], todayAmounts: [] };
      if (path.endsWith('/quran-sessions')) body = { rows: [], points: { total: 0, days: [] } };
      if (path.endsWith('/programs')) {
        programRequests++;
        if (fail) return route.fulfill({ status: 503, json: { message: 'تعذر تحميل البرامج.' } });
        body = { programs: [{ id: 12, title: 'برنامج اختبار الربط', contents: [{ type: 'text', value: 'محتوى البرنامج التجريبي' }], questions: [{ id: 1, text: 'سؤال الاختبار', options: [{ id: 10, text: 'الإجابة الأولى' }, { id: 20, text: 'الإجابة الثانية' }] }] }] };
      }
      if (path.endsWith('/programs/12/submit')) {
        assert.deepEqual(route.request().postDataJSON(), { answers: { 1: 10 } });
        submitted = true;
        body = { earnedPoints: 5 };
      }
      await route.fulfill({ json: body });
    });
    await page.goto('http://127.0.0.1:3000/#student/programs');
    await page.locator('.student-home-rankings .section-tabs-list').waitFor();
    if (!enabled) {
      assert.equal(await page.locator('.student-home-window').count(), 0);
      assert.equal(await page.getByRole('button', { name: 'البرامج', exact: true }).count(), 0);
      assert.equal(programRequests, 0);
      await page.goto('http://127.0.0.1:3000/#student/store');
      assert.equal(await page.locator('.student-home-window').count(), 0);
    } else {
      await page.getByText('تعذر تحميل البرامج.', { exact: true }).first().waitFor();
      fail = false;
      await page.locator('.student-programs').getByRole('button', { name: 'إعادة المحاولة' }).click();
      await page.getByRole('heading', { name: 'برنامج اختبار الربط' }).waitFor();
      await page.getByRole('button', { name: 'ابدأ', exact: true }).click();
      await page.getByRole('button', { name: 'بدء الاختبار' }).click();
      await page.getByText('الإجابة الأولى', { exact: true }).click();
      await page.getByRole('button', { name: 'إنهاء الاختبار' }).click();
      await page.getByText('تم الانتهاء من الاختبار!', { exact: true }).waitFor();
      assert.equal(submitted, true);
      await page.getByText('تم الانتهاء من الاختبار!', { exact: true }).waitFor({ state: 'hidden' });
      const nav = page.getByRole('navigation', { name: 'تنقل الطالب' });
      await nav.getByRole('button', { name: 'المتجر', exact: true }).click();
      await page.getByRole('heading', { name: 'منتج اختبار', exact: true }).waitFor();
      const buy = page.getByRole('button', { name: 'شراء', exact: true });
      assert.equal(await buy.nth(1).isDisabled(), true);
      await buy.first().click();
      await page.getByText('تم الشراء بنجاح', { exact: true }).waitFor();
      assert.equal(purchased, 1);
      assert.equal(await buy.first().isEnabled(), true);
      assert.equal(await buy.first().evaluate(el => globalThis.getComputedStyle(el).color), 'rgb(255, 255, 255)');
      await buy.first().click();
      await page.waitForFunction(() => globalThis.document.querySelectorAll('button:disabled').length > 0);
      await page.waitForTimeout(300);
      assert.equal(purchased, 2);
      assert.equal(purchaseIds.size, 2);
      assert.equal(await buy.first().isDisabled(), true);
      await nav.getByRole('button', { name: 'الرئيسية', exact: true }).click();
      await page.getByRole('button', { name: /الإشعارات/ }).click();
      await page.getByText('إشعار اختبار', { exact: true }).waitFor();
      assert.equal(read, true);

    }
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally { await browser.close(); }
