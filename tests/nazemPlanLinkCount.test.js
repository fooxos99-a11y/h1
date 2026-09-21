import test from 'node:test';
import assert from 'node:assert/strict';
import { syncNazemScheduledTaskRange } from '../server/integrations/nazem/dailyTasks.js';
import { loadNazemPlanLinkCount } from '../server/integrations/nazem/planLinkCount.js';

test('known remote link count repairs a stale local zero without altering an existing result', async () => {
  for (const existing of [false, true]) {
    const inserts = [];
    const connection = {
      beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {},
      query: async (sql, args) => {
        if (sql.includes('FROM student_quran_plans')) return [[{ id: 7, studentId: 8, track: 'memorization', linkPages: 0 }]];
        if (sql.includes('FROM nazem_plan_links')) {
          assert.deepEqual(args, [7, 8, 3]);
          return [[{ expectedCount: '5' }]];
        }
        if (sql.includes('FROM quran_ayah_pages')) return [[{ page: 2 }]];
        if (sql.includes('FROM student_quran_tasks t')) return [[]];
        if (sql.includes('FROM student_quran_tasks WHERE')) return [existing ? [{ id: 11 }] : []];
        if (sql.includes('INSERT INTO student_quran_tasks')) inserts.push(args[3]);
        else assert.match(sql, /INSERT INTO nazem_daily_follow_up_links/);
        return [{ insertId: 20 }];
      },
    };
    await syncNazemScheduledTaskRange(connection, { planId: 7, studentId: 8, teacherId: 3 }, {
      id: 42, date: '2026-09-13', taskType: 'memorization', remoteType: 'conserve',
      surah_from: 2, verse_from: 1, surah_to: 2, verse_to: 5,
    });
    assert.deepEqual(inserts, existing ? ['memorization', 'repeat'] : ['memorization', 'link', 'repeat']);
  }
});

test('zero, missing and invalid Nazem counts stay distinct and do not invent ten faces', async () => {
  for (const [value, expected] of [['0', 0], ['5', 5], [null, null], ['invalid', null]]) {
    const count = await loadNazemPlanLinkCount({ query: async () => [[{ expectedCount: value }]] }, {
      planId: 7, studentId: 8, teacherId: 3,
    });
    assert.equal(count, expected);
  }
});
