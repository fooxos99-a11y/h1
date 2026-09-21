import test from 'node:test';
import assert from 'node:assert/strict';
import { NazemAdapter } from '../server/integrations/nazem/adapter.js';
import { selectNazemFollowUpItem, recitationIdentityFromReceipt, loadConfirmedNazemRecordIds } from '../server/integrations/nazem/followUpCycles.js';

const date='2026-09-14';
const saved={id:1038590,date,surah_from:114,verse_from:1,surah_to:50,verse_to:45,actual_surah_to:50,actual_verse_to:45,status:'completed',mistake:3,tune:0};
const other={...saved,id:1038865,status:'not_completed',mistake:0,actual_surah_to:null,actual_verse_to:null};
const items=[{id:21792,type:'revision',status:'completed',is_active:false,cycle_index:7,today:other},{id:18742,type:'revision',status:'completed',is_active:false,cycle_index:2,today:saved}];
const student={nazemStudentId:'7734'};
function adapterFor(list=items){const a=new NazemAdapter();a.openFollowUp=async()=>({data:{students:[{student_id:7734,attendance_status:2,items:list}]}});return a;}

test('Mazen historical refresh selects the acknowledged second cycle, not the seventh cycle first in the response',async()=>{
 const history=await adapterFor().readStudentFollowUpHistory('191',student,1,{endDate:date,confirmedRecordIds:['1038590']});
 assert.equal(history.followUps.length,1);
 assert.equal(history.followUps[0].id,1038590);
 assert.equal(history.followUps[0].mistake,3);
 assert.equal(history.followUps[0].status,'completed');
});

test('a genuine active new cycle remains actionable despite a receipt for an older cycle',()=>{
 const active={...items[0],id:30000,status:'active',is_active:true,today:{...other,id:40000,status:'pending'}};
 assert.equal(selectNazemFollowUpItem([...items,active],'revision',{confirmedRecordIds:['1038590']}).id,30000);
 assert.equal(selectNazemFollowUpItem([...items,active],'revision',{sourceDayId:1038590}).id,18742);
});

test('receipt identity cannot be inferred from matching Quran range or a different attempt receipt',()=>{
 const previous={nazemSourceDayId:1032097};
 assert.equal(recitationIdentityFromReceipt(saved,[{deliveryStatus:'pending',deliverySnapshot:{externalId:1038590}}],previous),previous);
 assert.equal(recitationIdentityFromReceipt(saved,[{deliveryStatus:'synced',deliverySnapshot:{externalId:1038865}}],previous),previous);
 const matched=recitationIdentityFromReceipt(saved,[{deliveryStatus:'synced',deliverySnapshot:{externalId:1038590}}],previous);
 assert.equal(matched.nazemSourceDayId,1038590);
});

test('confirming a matching receipt still verifies the actual grade and mistakes',()=>{
 const a=adapterFor();
 const mapped={date,taskType:'review',remoteType:'revision',fromSurahId:114,fromAyah:1,scheduledToSurahId:50,scheduledToAyah:45,toSurahId:50,toAyah:45,completed:true,remoteMistakeCount:3,remoteTuneCount:0};
 assert.equal(a.verifyRecitationResult(saved,mapped).externalId,'1038590');
 assert.throws(()=>a.verifyRecitationResult({...saved,mistake:0},mapped));
});

test('confirmed record lookup is scoped to teacher, student, plan and official attempts',async()=>{
 const ids=await loadConfirmedNazemRecordIds({query:async(sql,args)=>{
  assert.deepEqual(args,[12,67,70]);assert.match(sql,/attempt.is_official = 1/);assert.match(sql,/receipt.sync_status = 'synced'/);
  return [[{snapshot:{externalId:1038590}},{snapshot:{externalId:'link:1038590'}},{snapshot:null}]];
 }},{teacherId:12,studentId:67,planId:70});
 assert.deepEqual(ids,['1038590']);
});
