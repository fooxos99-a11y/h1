import test from 'node:test';
import assert from 'node:assert/strict';
import { importNazemLinkResult } from '../server/integrations/nazem/linkResultImport.js';

test('a stale zero in Nazem cannot overwrite an accepted link waiting for delivery', async () => {
  const connection = { query: async (sql) => {
    if (sql.includes('FROM nazem_plan_links')) return [[{ expectedCount: '5' }]];
    if (sql.includes('FROM student_quran_tasks')) return [[{
      id: 1, evaluatedAt: '2026-09-13', teacherCompleted: 1, actualLinkCount: 5, hasPendingSubmission: 1,
    }]];
    assert.fail(`Pending local result must survive without any other queries: ${sql}`);
  } };
  await importNazemLinkResult(connection, { teacherId: 3, planId: 7, studentId: 8 }, {
    id: 42, date: '2026-09-13', taskType: 'memorization', remoteType: 'conserve', status: 'completed', link: 0,
  }, 4);
});
