import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch();
try {for(const width of [360,768,1440]){
 const page=await browser.newPage({viewport:{width,height:1000}});
 await page.goto((globalThis.process.env.PORTAL_TEST_URL||'http://127.0.0.1:33471')+'/tests/fixtures/notification-settings.html');
 await page.getByRole('switch',{name:'طلب جديد من المتجر',exact:true}).click();
 await page.getByRole('button',{name:'اختر الإداريين',exact:true}).click();
 await page.getByRole('button',{name:'إداري أول',exact:true}).click();
 await page.getByRole('button',{name:'إداري ثان',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>globalThis.notificationFixture.eventNotifications.storeOrder.administrators),[2,3]);
 await page.getByRole('switch',{name:'طلب جديد من المتجر',exact:true}).click();
 assert.equal(await page.getByText('الإداريون المستلمون',{exact:true}).count(),0);
 assert.equal(await page.evaluate(()=>globalThis.notificationFixture.eventNotifications.storeOrder.enabled),false);
 assert.equal(await page.getByText('قوالب التسجيل',{exact:true}).count(),1);
 assert.equal(await page.evaluate(()=>globalThis.document.documentElement.scrollWidth>globalThis.innerWidth),false);
 await page.screenshot({path:'outputs/notification-settings-'+width+'.png',fullPage:true});
 await page.close();
}}finally{await browser.close();}
