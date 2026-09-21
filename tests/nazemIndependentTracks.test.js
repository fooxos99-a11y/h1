import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { syncNazemScheduledTaskRange } from '../server/integrations/nazem/dailyTasks.js';
import { selectNazemFirstActionableTasks } from '../server/integrations/nazem/taskSelection.js';
import { mapRuwasiRecitationGroupToNazem } from '../server/integrations/nazem/mapping.js';
import { nazemTaskTrack } from '../server/integrations/nazem/taskTrack.js';
import { up, down } from '../server/migrations/2026.09.06.1-nazem-independent-tracks.js';

test('same-day Nazem memorization and mastery retain separate tasks, ranges and daily identities', async () => {
  const tasks = [];
  const daily = new Map();
  let sequence = 0;
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    async query(sql, params = []) {
      if (sql.includes('FROM nazem_plan_links')) return [[]];
      if (sql.includes('FROM student_quran_plans')) return [[{ id: 7, studentId: 9, track: 'memorization' }]];
      if (sql.includes('FROM quran_ayah_pages')) return [[{ page: 3 }]];
      if (sql.includes('FROM student_quran_tasks t')) {
        assert.match(sql, /t\.track = \?/);
        return [tasks.filter((task) => task.type === params[3] && task.track === params[4])];
      }
      if (sql.includes('INSERT INTO nazem_daily_follow_up_links')) {
        daily.set(params.slice(0, 6).join(':'), params[6]);
      } else if (sql.includes('DELETE FROM student_quran_tasks')) {
        for (let index = tasks.length - 1; index >= 0; index -= 1) {
          if (params.includes(tasks[index].id)) tasks.splice(index, 1);
        }
      } else if (sql.includes('INSERT INTO student_quran_tasks')) {
        tasks.push({ id: ++sequence, type: params[3], track: params[4],
          fromSurah: params[7], fromAyah: params[8], toSurah: params[9], toAyah: params[10],
          studentStatus: 'pending', teacherCompleted: null });
      } else {
        assert.fail(`Unexpected mutation: ${sql}`);
      }
      return [{ insertId: sequence, affectedRows: 1 }];
    },
  };
  const link = { planId: 7, studentId: 9, teacherId: 12 };
  const day = { date: '2026-09-06', taskType: 'memorization',
    surah_from: 2, verse_from: 1, surah_to: 2, verse_to: 5 };
  await syncNazemScheduledTaskRange(connection, link, { ...day, remoteType: 'conserve', id: 81 });
  await syncNazemScheduledTaskRange(connection, link, { ...day, remoteType: 'master', id: 82 });
  assert.equal(tasks.length, 4);
  assert.equal(daily.size, 2);
  const memorizationIds = tasks.filter((task) => task.track === 'memorization').map((task) => task.id);
  await syncNazemScheduledTaskRange(connection, link, { ...day, remoteType: 'master', id: 82, verse_to: 9 });
  assert.equal(tasks.length, 4);
  assert.deepEqual(tasks.filter((task) => task.track === 'memorization').map((task) => task.id), memorizationIds);
  assert.ok(tasks.filter((task) => task.track === 'mastery').every((task) => task.toAyah === 9));
  tasks.find((task) => task.type === 'memorization' && task.track === 'mastery').teacherCompleted = 1;
  const result = await syncNazemScheduledTaskRange(connection, link, { ...day, remoteType: 'master', id: 82, verse_to: 12 });
  assert.equal(result.reason, 'task_started');
  assert.ok(tasks.filter((task) => task.track === 'memorization').every((task) => task.toAyah === 5));
});

test('Nazem overdue selection and outbound grouping cannot mix memorization with mastery', () => {
  const base = { planId: 7, studentId: 9, taskType: 'memorization', nazemManaged: 1 };
  const rows = [
    { ...base, id: 1, track: 'memorization', taskDate: '2026-09-05' },
    { ...base, id: 2, track: 'memorization', taskDate: '2026-09-06' },
    { ...base, id: 3, track: 'mastery', taskDate: '2026-09-06' },
  ];
  assert.deepEqual(selectNazemFirstActionableTasks(rows).map((row) => row.id), [1, 3]);
  assert.throws(() => mapRuwasiRecitationGroupToNazem([rows[0], rows[2]]), { code: 'RUWASI_RECITATION_GROUP_MIXED' });
  assert.equal(nazemTaskTrack({ taskType: 'memorization', remoteType: 'master' }), 'mastery');
  assert.equal(nazemTaskTrack({ taskType: 'memorization', remoteType: 'conserve', track: 'mastery' }), 'memorization');
  assert.equal(nazemTaskTrack({ taskType: 'review', track: 'mastery' }), 'memorization');
  const queue = readFileSync(new URL('../server/integrations/nazem/queue.js', import.meta.url), 'utf8');
  const service = readFileSync(new URL('../server/integrations/nazem/service.js', import.meta.url), 'utf8');
  assert.match(queue, /currentTask\.task_type = \? AND currentTask\.track = \?/);
  assert.match(service, /daily\.taskType, daily\.track/);
  assert.match(service, /day\.taskType, track\]/);
});

test('independent-track migration preserves old rows and refuses a destructive rollback', async () => {
  const queries = [];
  await up({ async query(sql) { queries.push(sql); return [[{ count: 0 }]]; } });
  assert.ok(queries.some((sql) => sql.includes('ADD COLUMN track')));
  assert.ok(queries.some((sql) => sql.includes('$.remoteType')));
  assert.ok(queries.some((sql) => sql.includes('task_type, track, from_page')));
  assert.ok(queries.every((sql) => !sql.includes('DELETE FROM')));
  await assert.rejects(down({ async query() { return [[{ duplicate: 1 }]]; } }), /Cannot roll back independent tracks/);
});
