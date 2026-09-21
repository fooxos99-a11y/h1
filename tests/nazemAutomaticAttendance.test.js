import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureNazemAutomaticAttendance } from '../server/services/nazemAutomaticAttendance.js';

function fixture(overrides = {}) {
  const options = { enabled: true, date: '2026-09-09', today: '2026-09-09', actor: { role: 'supervisor', id: 11 },
    settings: { nazemIntegrationEnabled: true }, students: [{ id: 1, nazemManaged: 1 }, { id: 2, nazemManaged: 0 }],
    attendanceByStudent: new Map(), ...overrides };
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'), commit: async () => calls.push('commit'), rollback: async () => calls.push('rollback'),
    query: async (sql) => sql.includes('SELECT id, status') ? [[]] : [[{ id: 20 }]],
  };
  const dependencies = { saveAttendance: async (_connection, value) => calls.push({ save: value }),
    enqueueAttendance: async (_connection, value) => calls.push({ queue: value }) };
  return { options, calls, connection, dependencies };
}

test('only linked students without attendance default to present, once, through existing points and sync services', async () => {
  const f = fixture();
  assert.deepEqual(await ensureNazemAutomaticAttendance(f.connection, f.options, f.dependencies), [1]);
  assert.equal(f.options.attendanceByStudent.get(1), 'present');
  assert.equal(f.options.attendanceByStudent.has(2), false);
  assert.equal(f.calls.find((c) => c.save)?.save.status, 'present');
  assert.equal(f.calls.find((c) => c.queue)?.queue.explicitChange, false);
  await ensureNazemAutomaticAttendance(f.connection, f.options, f.dependencies);
  assert.equal(f.calls.filter((c) => c.save).length, 1);
});

test('automatic attendance preserves all recorded statuses and skips history, other roles and disabled sites', async () => {
  for (const status of ['absent', 'excused', 'late', 'present']) {
    const f = fixture({ attendanceByStudent: new Map([[1, status]]) });
    assert.deepEqual(await ensureNazemAutomaticAttendance(f.connection, f.options, f.dependencies), []);
    assert.equal(f.options.attendanceByStudent.get(1), status);
    assert.equal(f.calls.length, 0);
  }
  for (const override of [{ enabled: false }, { date: '2026-09-08' }, { date: '2026-09-10' }, { actor: { role: 'student' } }, { settings: { nazemIntegrationEnabled: false } }]) {
    const f = fixture(override);
    assert.deepEqual(await ensureNazemAutomaticAttendance(f.connection, f.options, f.dependencies), []);
    assert.equal(f.calls.length, 0);
  }
});

test('attendance arriving concurrently wins over the default, and failed saves roll back', async () => {
  const f = fixture();
  f.connection.query = async (sql) => sql.includes('SELECT id, status') ? [[{ id: 20, status: 'absent' }]] : [[{ id: 1 }]];
  await ensureNazemAutomaticAttendance(f.connection, f.options, f.dependencies);
  assert.equal(f.options.attendanceByStudent.get(1), 'absent');
  assert.equal(f.calls.some((c) => c.save), false);
  const broken = fixture();
  broken.dependencies.enqueueAttendance = async () => { throw new Error('queue unavailable'); };
  await assert.rejects(ensureNazemAutomaticAttendance(broken.connection, broken.options, broken.dependencies), /queue unavailable/);
  assert.ok(broken.calls.includes('rollback'));
  assert.equal(broken.options.attendanceByStudent.size, 0);
});
