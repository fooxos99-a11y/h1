import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { correctionPageOptions } from '../shared/execution-correction-options.js';

test('face corrections allow smaller and larger ends and preserve the exact partial boundary', () => {
 const options = [{page:2,surah:2,ayah:1},{page:2,surah:2,ayah:5},{page:3,surah:2,ayah:9},{page:4,surah:2,ayah:12}];
 assert.deepEqual(correctionPageOptions(options), [options[1],options[2],options[3]]);
});

test('reverse face selection uses the last allowed verse in traversal order', () => {
 const options = [{page:4,surah:2,ayah:12},{page:4,surah:2,ayah:10},{page:3,surah:2,ayah:6}];
 assert.deepEqual(correctionPageOptions(options),[options[1],options[2]]);
});

test('authorized correction shares its expanded bounds between reading and saving', () => {
 const source = readFileSync(new URL('../server/index.js', import.meta.url),'utf8');
 assert.match(source,/getAllowedExecutionEnd\(connection, correctionPlan, taskEndPosition\(last\), first.taskType\)/);
 assert.match(source,/!administrativeCorrection && !canStudentSetQuranTaskEnd/);
 assert.match(source,/if \(administrativeCorrection\) \{\s*allowedEnd = await getAllowedExecutionEnd\(connection, plan, expectedEnd, first.taskType\)/);
 const component = readFileSync(new URL('../src/components/dashboard/ExecutionCorrectionEndSelector.jsx',import.meta.url),'utf8');
 assert.match(component,/referenceMode !== 'page'/);
 assert.match(component,/correctionPageOptions\(options\)/);
});
