import test from 'node:test';
import assert from 'node:assert/strict';
import { loadNazemCompletedStudentIds } from '../server/integrations/nazem/completedRecitation.js';
import { shouldShowRecitationStudent } from '../src/lib/recitationActionState.js';

test('remote completion requires every returned daily record to be completed', async () => {
  const connection = { query: async (sql, params) => {
    assert.deepEqual(params, [4, 4, '2026-09-23']);
    assert.match(sql, /followUp.follow_up_date = \?/);
    assert.match(sql, /planLink.sync_status NOT IN \('deleted','detached'\)/);
    return [[
      { studentId: 1, status: 'completed' }, { studentId: 1, status: 'completed_early' },
      { studentId: 2, status: 'completed' }, { studentId: 2, status: 'partial' },
      { studentId: 3, status: 'completed_late' }, { studentId: 4, status: null },
      { studentId: 5, status: 'not_completed' },
    ]];
  } };
  assert.deepEqual([...await loadNazemCompletedStudentIds(connection, 4, '2026-09-23')], [1, 3]);
  assert.equal((await loadNazemCompletedStudentIds({ query: async () => [[]] }, 4, '2026-09-23')).size, 0);
});

test('a remotely completed student remains visible for the completed label', () => {
  assert.equal(shouldShowRecitationStudent({ studentId: 1, attendanceStatus: 'present', nazemRecitationCompleted: true, recitationFinished: true }), true);
});
