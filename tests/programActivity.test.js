import test from 'node:test';
import assert from 'node:assert/strict';
import { canOpenProgram, hasProgramActivity } from '../src/lib/programActivity.js';

test('manual programs and empty sections have no activity, including blank rich text', () => {
  for (const completedAt of [null, '2026-09-22']) {
    assert.equal(canOpenProgram({ completedAt, earnedPoints: 0, contents: [], questions: [] }), false);
  }
  assert.equal(hasProgramActivity({ contents: [{ type: 'text', value: '<p><br>&nbsp;</p>' }] }), false);
  assert.equal(canOpenProgram({ sectionsEnabled: true, sections: [] }), false);
  assert.equal(canOpenProgram({ sectionsEnabled: true, sections: [{ id: 1 }] }), true);
  assert.equal(hasProgramActivity({ questions: [{ id: 1 }] }), true);
  assert.equal(hasProgramActivity({ contents: [{ type: 'text', value: '<p>محتوى</p>' }] }), true);
  assert.equal(hasProgramActivity({ contents: [{ type: 'file', value: '/file.pdf' }] }), true);
});

test('activity detection handles unmatched and repeated markup brackets without losing real content', () => {
  for (const [value, expected] of [
    ['<'.repeat(100000), true],
    ['<'.repeat(100000) + '>', false],
    ['<p></p>نص<unfinished', true],
    ['<p> &NBSP; </p>', false],
    ['<p><br></p>'.repeat(10000), false],
  ]) {
    assert.equal(hasProgramActivity({ contents: [{ value }] }), expected);
  }
});
