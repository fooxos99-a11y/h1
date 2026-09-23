import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeVerifiedNazemRoster, refreshNazemRoster } from '../server/integrations/nazem/rosterState.js';
import { up, down } from '../server/migrations/2026.09.23.1-nazem-roster-state.js';

test('roster matches stable IDs and distinguishes stopped, returning and unknown states', () => {
  assert.deepEqual(normalizeVerifiedNazemRoster([
    { id: '17829', statusName: 'مستمر' }, { id: '28587', statusName: 'غير مستمر' },
    { id: '23519', statusName: 'حالة جديدة' },
  ]), [{ id: '17829', active: 1 }, { id: '28587', active: 0 }, { id: '23519', active: null }]);
  assert.deepEqual(normalizeVerifiedNazemRoster([{ id: '28587', statusName: 'مستمر' }]), [{ id: '28587', active: 1 }]);
  for (const value of [null, [{ id: null }], [{ id: '12' }, { id: '12' }]]) {
    assert.throws(() => normalizeVerifiedNazemRoster(value));
  }
});

test('failed or incomplete roster never changes local visibility', async () => {
  let writes = 0;
  const connection = { query: async () => { writes++; } };
  await assert.rejects(refreshNazemRoster(connection, 7, { getStudentProfiles: async () => { throw new Error('page two failed'); } }));
  await assert.rejects(refreshNazemRoster(connection, 7, { getStudentProfiles: async () => [{ id: null }] }));
  assert.equal(writes, 0);
});

test('roster update is atomic, teacher scoped and preserves unknown statuses and historical data', async () => {
  let update;
  await refreshNazemRoster({ query: async (sql, params) => { update = { sql, params }; } }, 7,
    { getStudentProfiles: async () => [{ id: '28587', statusName: 'غير مستمر' }] });
  assert.deepEqual(update.params, ['[{"id":"28587","active":0}]', 7]);
  assert.match(update.sql, /roster.externalId IS NULL THEN 0/);
  assert.match(update.sql, /COALESCE\(roster.active, link.roster_active\)/);
  assert.match(update.sql, /WHERE link.teacher_id = \? AND link.status = 'linked'/);
  assert.doesNotMatch(update.sql, /DELETE|UPDATE students|UPDATE student_quran/);
});

test('scheduled refresh and discovery refresh roster; evaluation filters both students and their tasks', () => {
  const service = readFileSync(new URL('../server/integrations/nazem/service.js', import.meta.url), 'utf8');
  assert.equal(service.match(/await refreshNazemRoster\(connection, job.teacherId, adapter\)/g).length, 2);
  assert.match(service, /COALESCE\(student.roster_active, 1\) = 1/);
  const server = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  assert.match(server, /rosterLink.teacher_id = sc.supervisor_id[\s\S]*rosterLink.roster_active = 0/);
  assert.match(server, /!visibleStudentIds.has\(Number\(row.studentId\)\)/);
});

test('roster migration preserves existing links and provides rollback', async () => {
  const statements = [];
  const connection = { query: async sql => { statements.push(sql); return [[{ count: 0 }]]; } };
  await up(connection);
  assert.match(statements[1], /roster_active TINYINT NULL DEFAULT NULL/);
  await down(connection);
  assert.match(statements[2], /DROP COLUMN roster_active/);
});
