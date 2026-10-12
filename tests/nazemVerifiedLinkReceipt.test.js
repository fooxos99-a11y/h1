import test from 'node:test';import assert from 'node:assert/strict';
import { verifiedLinkSnapshot, confirmVerifiedNazemLinks } from '../server/integrations/nazem/verifiedLinkReceipt.js';
const day={id:945730,date:'2026-09-30',remoteType:'conserve',status:'completed',link:5,surah_from:60,verse_from:10,surah_to:60,verse_to:11};
const target={studentExternalId:'17',planExternalId:'18',attemptIds:[6606],source:{...day}};
const job={id:28832,dailyId:1592305,track:'memorization',attemptCount:1,nazemStudentId:'17',nazemPlanId:'18',payload:{taskType:'link',taskDate:day.date,submissionTarget:target}};
const tasks=[{attemptId:6606,linkCount:5}];
test('a remote link receipt requires the exact original day, account, plan, latest attempt and count',()=>{
  assert.equal(verifiedLinkSnapshot(job,day,tasks).alreadyRecorded,true);
  for(const change of [{id:945731},{status:'pending'},{link:null},{link:4},{date:'2026-10-04'},{remoteType:'revision'},{verse_to:12}]) assert.equal(verifiedLinkSnapshot(job,{...day,...change},tasks),null);
  assert.equal(verifiedLinkSnapshot({...job,nazemStudentId:'other'},day,tasks),null);
  assert.equal(verifiedLinkSnapshot({...job,nazemPlanId:'other'},day,tasks),null);
  assert.equal(verifiedLinkSnapshot(job,day,[{attemptId:6133,linkCount:5}]),null);
  assert.equal(verifiedLinkSnapshot(job,day,[{attemptId:6606,linkCount:null}]),null);
});
test('zero is a confirmed failed link result and cannot be mistaken for an unevaluated link',()=>{
  assert.equal(verifiedLinkSnapshot(job,{...day,link:0},[{attemptId:6606,linkCount:0}]).status,'not_completed');
});
test('receipt confirmation writes synchronization and audit records without changing grades, balances or attempting external delivery',async()=>{
  const updates=[];
  const connection={query:async(sql,params)=>{
    if(sql.startsWith('SELECT job.id')) return [[job]];
    if(sql.startsWith('SELECT task.actual')) return [tasks];
    assert.doesNotMatch(sql,/UPDATE student_quran|UPDATE students|DELETE|payload_json\s*=/);
    updates.push([sql,params]);return [{affectedRows:1}];
  }};
  assert.deepEqual(await confirmVerifiedNazemLinks(connection,{teacherId:11,studentId:157,planId:89},day),[28832]);
  assert.equal(updates.length,4);
  assert.doesNotMatch(updates[0][0], /nazem_record_id\s*=/);
  updates.length=0;
  assert.deepEqual(await confirmVerifiedNazemLinks(connection,{teacherId:11,studentId:157,planId:89},{...day,link:4}),[]);
  assert.equal(updates.length,0);
});
