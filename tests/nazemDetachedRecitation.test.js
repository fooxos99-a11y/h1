import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { validateNazemLateSession } from '../server/services/nazemLateSelection.js';

const date = '2026-10-13';
const session = (ids = [3]) => ({ sessionId: 'detached-session', studentId: 24, sessionDate: date,
  tasks: ids.map(taskId => ({ taskId })) });

function fixture() {
  const database = new DatabaseSync(':memory:');
  database.function('DATE_FORMAT', (value, _format) => value);
  database.function('CONCAT', { varargs: true }, (...values) => values.join(''));
  database.function('JSON_UNQUOTE', value => value);
  database.function('JSON_EXTRACT', (value, path) => {
    const result = JSON.parse(value)[path.slice(2)];
    return typeof result === 'boolean' ? String(result) : result ?? null;
  });
  database.function('LEAST', { varargs: true }, (...values) => Math.min(...values));
  database.function('GREATEST', { varargs: true }, (...values) => Math.max(...values));
  database.exec(`
    CREATE TABLE students (id INTEGER, committee_id INTEGER);
    CREATE TABLE supervisor_committees (supervisor_id INTEGER, committee_id INTEGER);
    CREATE TABLE student_quran_tasks (id INTEGER, student_id INTEGER, plan_id INTEGER, task_type TEXT,
      track TEXT, task_date TEXT, from_surah INTEGER, from_ayah INTEGER, to_surah INTEGER, to_ayah INTEGER, to_page INTEGER);
    CREATE TABLE student_quran_recitation_attempts (task_id INTEGER, request_id TEXT, is_official INTEGER, teacher_completed INTEGER);
    CREATE TABLE nazem_plan_links (ruwasi_plan_id INTEGER, ruwasi_student_id INTEGER, teacher_id INTEGER, sync_status TEXT);
    CREATE TABLE nazem_accounts (teacher_id INTEGER, status TEXT);
    CREATE TABLE app_settings (setting_key TEXT, setting_value TEXT);
    CREATE TABLE quran_surahs (surah_number INTEGER, ayah_count INTEGER);
    CREATE TABLE nazem_daily_follow_up_links (id INTEGER, teacher_id INTEGER, ruwasi_student_id INTEGER,
      ruwasi_plan_id INTEGER, follow_up_date TEXT, task_type TEXT, track TEXT, remote_snapshot TEXT, last_remote_checked_at TEXT);
    INSERT INTO students VALUES (24, 8);
    INSERT INTO supervisor_committees VALUES (14, 8);
    INSERT INTO nazem_plan_links VALUES (7, 24, 14, 'synced');
    INSERT INTO nazem_accounts VALUES (14, 'connected');
    INSERT INTO app_settings VALUES ('nazemIntegrationEnabled', 'true');
    INSERT INTO quran_surahs VALUES (60, 13);
    INSERT INTO student_quran_tasks VALUES
      (1, 24, 7, 'memorization', 'memorization', '2026-10-11', 60, 1, 60, 4, 549),
      (2, 24, 7, 'memorization', 'memorization', '2026-10-12', 60, 5, 60, 9, 550),
      (3, 24, 7, 'memorization', 'memorization', '2026-10-13', 60, 10, 60, 13, 551);
  `);
  const insert = database.prepare(`INSERT INTO nazem_daily_follow_up_links
    VALUES (?, 14, 24, 7, ?, 'memorization', 'memorization', ?, ?)`);
  for (const [id, taskDate, from, to] of [[1, '2026-10-11', 1, 4], [2, '2026-10-12', 5, 9], [3, date, 10, 13]]) {
    insert.run(id, taskDate, JSON.stringify({ nazemLate: id < 3, nazemLateAvailableOn: date, nazemQueueDate: date,
      nazemActionableDate: '2026-10-11', status: 'pending', surah_from: 60, verse_from: from, surah_to: 60, verse_to: to }), date);
  }
  const connection = { query: async (sql, values) => {
    assert.match(sql.trim(), /^SELECT/, 'Sequence validation must not change stored results');
    return [database.prepare(sql.replace(/FOR UPDATE/g, '')).all(...values)];
  } };
  return { database, connection };
}

for (const [name, change, ids] of [
  ['disabled integration', "UPDATE app_settings SET setting_value = 'false'", [3]],
  ['blocked teacher account', "UPDATE nazem_accounts SET status = 'blocked'", [3]],
  ['removed teacher account with a retained plan identity', 'DELETE FROM nazem_accounts', [3]],
  ['detached plan with retained late snapshots', "UPDATE nazem_plan_links SET sync_status = 'detached'", [2]],
  ['deleted plan with retained late snapshots', "UPDATE nazem_plan_links SET sync_status = 'deleted'", [2]],
  ['unlinked account with retained daily history', 'DELETE FROM nazem_accounts; DELETE FROM nazem_plan_links', [2]],
]) {
  test(`${name} does not impose Nazem backlog ordering on authorized local recitation`, async () => {
    const { database, connection } = fixture();
    try {
      database.exec(change);
      assert.equal(await validateNazemLateSession(connection, session(ids), 14), true);
      assert.equal(database.prepare('SELECT COUNT(*) AS count FROM nazem_daily_follow_up_links').get().count, 3);
    } finally { database.close(); }
  });
}

test('connected Nazem plans still require the oldest late first and allow exact session replay', async () => {
  const { database, connection } = fixture();
  try {
    assert.equal(await validateNazemLateSession(connection, session([3]), 14), false);
    assert.equal(await validateNazemLateSession(connection, session([2]), 14), false);
    assert.equal(await validateNazemLateSession(connection, session([1]), 14), true);
    database.exec("INSERT INTO student_quran_recitation_attempts VALUES (3, 'detached-session:3', 1, 1)");
    assert.equal(await validateNazemLateSession(connection, session([3]), 14), true);
  } finally { database.close(); }
});

test('local sequence checks still reject foreign students, foreign teachers and invalid task IDs', async () => {
  const { database, connection } = fixture();
  try {
    database.exec("UPDATE app_settings SET setting_value = 'false'");
    assert.equal(await validateNazemLateSession(connection, { ...session(), studentId: 99 }, 14), false);
    assert.equal(await validateNazemLateSession(connection, session(), 15), false);
    for (const ids of [[], [0], [3, 3], [3, 999]]) {
      assert.equal(await validateNazemLateSession(connection, session(ids), 14), false);
    }
  } finally { database.close(); }
});
