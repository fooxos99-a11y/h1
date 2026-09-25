import test from 'node:test';
import assert from 'node:assert/strict';
import { extendReviewEnd } from '../shared/quran-review-extension.js';
import { canStudentSetQuranTaskEnd } from '../shared/quran-execution-policy.js';
import { calculateStudentExecutionPoints } from '../server/services/quranPoints.js';
const ayahs = Array.from({length:8}, (_, i) => ({page:1,surah:1,ayah:i+1}));
test('review extension stops before link or unmemorized ayahs', () => {
  for (const blocked of [6,7]) assert.equal(extendReviewEnd({ayahs, expectedEnd:ayahs[2], isAvailable: a => a.ayah !== blocked}).ayah, blocked-1);
  const reverse = ayahs.map(a => ({page:a.ayah,surah:a.ayah,ayah:1}));
  assert.equal(extendReviewEnd({ayahs:reverse, expectedEnd:reverse[5], direction:-1, isAvailable:a=>a.surah!==3}).surah,4);
});
test('review editing permits both increase and decrease only when enabled', () => {
  for (const comparison of [-1,1]) {
    assert.equal(canStudentSetQuranTaskEnd({studentReviewAmountEditable:true},'review',comparison),true);
    assert.equal(canStudentSetQuranTaskEnd({studentReviewAmountEditable:false},'review',comparison),false);
  }
});
test('review points cap at the target and decrease proportionally below it', () => {
  for (const [completedAmount, expected] of [[5,50],[10,100],[15,100]]) {
    const result=calculateStudentExecutionPoints({taskType:'review',completedAmount,expectedAmount:10,settings:{reviewEvaluationMaxScore:100}});
    assert.equal(result.total,expected);
  }
});

test('exact review completion is not reduced by fractional face rounding', () => {
 assert.equal(calculateStudentExecutionPoints({taskType:'review',completedAmount:0.2,expectedAmount:0.25,completedExpectedRange:true,settings:{reviewEvaluationMaxScore:100}}).total,100);
});
