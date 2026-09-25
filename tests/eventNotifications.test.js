import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEventNotifications, formatEventNotification } from '../shared/event-notifications.js';
import { emitEventNotification, notifyCityTransition } from '../server/services/eventNotifications.js';
function storage() {
  const messages = new Map(), recipients = new Set(), deliveries = new Set();
  return { messages, recipients, deliveries, async query(sql, values = []) {
    if (sql.includes('FROM supervisors')) return [[{id:2,role:'admin'},{id:3,role:'manager'}].filter(p=>values[0].includes(p.id))];
    if (sql.startsWith('INSERT INTO app_notifications')) { if(!messages.has(values[2])) messages.set(values[2], {id:messages.size+1,body:values[1]}); return [{insertId:messages.get(values[2]).id}]; }
    if (sql.startsWith('INSERT IGNORE INTO app_notification_recipients')) { recipients.add(values.join(':')); return [{}]; }
    if (sql.startsWith('INSERT IGNORE INTO notification_push_deliveries')) { for(const recipient of recipients) if(recipient.startsWith(values[0]+':')) deliveries.add(recipient); return [{}]; }
    throw new Error('Unexpected query: '+sql);
  }};
}
test('disabled events do not write inbox or push deliveries', async()=>{
 for(const type of ['program','station','city','violation','storeOrder']) {
  const config=normalizeEventNotifications({[type]:{enabled:false}});
  await emitEventNotification({query:()=>{throw new Error('must not query');}},{type,key:'1',config,recipients:[{role:'student',id:1}]});
 }
});
test('store notifications target only selected active administrators and queue their devices once',async()=>{
 const db=storage(),config=normalizeEventNotifications({storeOrder:{enabled:true,administrators:[2,3,99]}});
 for(let n=0;n<2;n++)await emitEventNotification(db,{type:'storeOrder',key:'7',config,values:{student:'طالب',product:'كتاب'}});
 assert.deepEqual([...db.recipients].sort(),['1:admin:2','1:manager:3']);
 assert.deepEqual(db.deliveries,db.recipients);assert.equal(db.messages.size,1);
 const empty=storage();await emitEventNotification(empty,{type:'storeOrder',key:'8',config:normalizeEventNotifications({storeOrder:{enabled:true,administrators:[]}})});assert.equal(empty.messages.size,0);
});
test('student events keep recipient isolation, templates, and inbox/push consistency',async()=>{
 const db=storage(),config=normalizeEventNotifications({});
 for(const type of ['program','station','violation']) await emitEventNotification(db,{type,key:type,config,recipients:[{role:'student',id:11}],values:{program:'برنامج',station:'محطة',reason:'سبب'}});
 assert.equal(db.messages.size,3);assert.equal(db.recipients.size,3);assert.deepEqual(db.deliveries,db.recipients);
 assert.equal(formatEventNotification('{program} {reason}',{program:'{reason}',reason:'اختبار'}),'{reason} اختبار');
});
test('city notifications require a real forward transition and do not repeat on resettlement',async()=>{
 const db=storage(),settings={eventNotifications:normalizeEventNotifications({}),summitEnabled:true,summitMapConfig:{cities:[{id:'a',name:'أ',kilometer:0},{id:'b',name:'ب',kilometer:100}]}};
 for(const [from,to] of [[0,50],[50,100],[100,150],[150,50],[50,100]]) await notifyCityTransition(db,11,from,to,settings);
 assert.equal(db.messages.size,1);assert.deepEqual([...db.recipients],['1:student:11']);
});
