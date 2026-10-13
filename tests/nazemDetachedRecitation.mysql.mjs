import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import process from 'node:process';
import { URL } from 'node:url';
import mysql from 'mysql2/promise';
import { shiftDateOnly } from '../shared/business-date.js';
import { validateNazemLateSession } from '../server/services/nazemLateSelection.js';

// Opt-in isolated API; no application environment files or remote Nazem access.
const base = process.env.QURAN_TEST_API_URL;
const database = process.env.QURAN_TEST_MYSQL_DATABASE;
assert.equal(new URL(base).hostname, '127.0.0.1');
assert.match(database || '', /^quran_audit_detached_[a-z0-9_]+$/);
assert.ok(process.env.QURAN_TEST_MYSQL_USER && process.env.QURAN_TEST_MYSQL_PORT);
const registration = process.env.QURAN_TEST_REGISTRATION;
const connection = await mysql.createConnection({ host: '127.0.0.1', port: Number(process.env.QURAN_TEST_MYSQL_PORT),
  user: process.env.QURAN_TEST_MYSQL_USER, password: process.env.QURAN_TEST_MYSQL_PASSWORD || '', database });
const run = crypto.randomBytes(5).toString('hex');
async function api(path, token, body, method = body ? 'POST' : 'GET', expected = 200) {
  const response = await globalThis.fetch(`${base}${path}`, { method,
    headers: { 'Content-Type': 'application/json', 'X-Madarij-Native': '1', 'X-Registration-Number': registration,
      ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  assert.equal(response.status, expected, `${path}: ${result.message || JSON.stringify(result)}`);
  return result;
}
const login = loginNumber => api('/auth/login', null, { loginNumber, registrationNumber: registration });
try {
  const manager = await login(process.env.QURAN_TEST_MANAGER_LOGIN);
  const initialSettings = await api('/settings', manager.token);
  const settings = { ...initialSettings, nazemIntegrationEnabled: false, weeklyHolidayDays: [],
    recitationSessionDays: [0, 1, 2, 3, 4, 5, 6], recitationAmountDay: 'same_day',
    memorizationExecutionSource: 'both', reviewExecutionSource: 'both', linkExecutionSource: 'both' };
  await api('/settings', manager.token, settings, 'PUT');
  await api('/nazem/config', manager.token, { enabled: false }, 'PUT');
  const [committee] = await connection.query('INSERT INTO committees (name) VALUES (?)', [`فصل ناظم ${run}`]);
  const number = `detached-teacher-${run}`;
  const [teacherRow] = await connection.query(
    'INSERT INTO supervisors (name, login_number, national_id, phone, job_title, role) VALUES (?, ?, ?, ?, ?, ?)',
    ['معلم اختبار فصل ناظم', number, number, '', 'معلم', 'supervisor']);
  await connection.query('INSERT INTO supervisor_committees (supervisor_id, committee_id) VALUES (?, ?)', [teacherRow.insertId, committee.insertId]);
  const teacher = await login(number);
  await api('/recitation-preferences/me', teacher.token,
    { memorizationMode: 'count', masteryMode: 'count', reviewMode: 'count', linkMode: 'count' }, 'PUT');
  for (const scenario of ['disabled', 'blocked', 'unlinked']) {
    await api('/nazem/config', manager.token, { enabled: false }, 'PUT');
    await api('/settings', manager.token, settings, 'PUT');
    const studentNumber = `detached-${run}-${scenario}`;
    const [student] = await connection.query(
      'INSERT INTO students (name, login_number, national_id, guardian_phone, committee_id) VALUES (?, ?, ?, ?, ?)',
      [`طالب اختبار ${scenario}`, studentNumber, studentNumber, '', committee.insertId]);
    const plan = await api(`/student-plans/${student.insertId}`, manager.token,
      { startPage: 22, endPage: 40, dailyPages: 1, linkPages: 2, reviewPages: 5, priorMemorization: [{ startPage: 2, endPage: 21 }] }, 'PUT');
    const studentLogin = await login(studentNumber);
    const today = await api(`/students/${student.insertId}/quran-today`, studentLogin.token);
    const task = today.tasks.find(item => item.taskType === 'memorization');
    assert.ok(task);
    await connection.query('INSERT INTO attendance_records (student_id, record_date, status) VALUES (?, ?, ?)', [student.insertId, today.date, 'present']);
    // Deliberately invalid encrypted fixtures cannot authenticate to any remote service.
    await connection.query(`INSERT INTO nazem_accounts (teacher_id, encrypted_username, encrypted_password, status)
      VALUES (?, 'test-fixture-only', 'test-fixture-only', 'connected')
      ON DUPLICATE KEY UPDATE status = 'connected'`, [teacher.id]);
    await connection.query(`INSERT INTO nazem_plan_links
      (ruwasi_plan_id, ruwasi_student_id, teacher_id, nazem_student_id, nazem_plan_id, sync_status)
      VALUES (?, ?, ?, ?, ?, 'synced')`, [plan.id, student.insertId, teacher.id, `student-${student.insertId}`, `plan-${plan.id}`]);
    const oldDate = shiftDateOnly(today.date, -1);
    const [oldTask] = await connection.query(`INSERT INTO student_quran_tasks
      (plan_id, student_id, task_type, track, task_date, from_page, from_surah, from_ayah, to_page, to_surah, to_ayah, target_pages)
      SELECT plan_id, student_id, task_type, track, ?, from_page, from_surah, from_ayah, to_page, to_surah, to_ayah, target_pages
      FROM student_quran_tasks WHERE id = ?`, [oldDate, task.id]);
    for (const sourceDate of [oldDate, today.date]) {
      const snapshot = { nazemLate: true, nazemLateAvailableOn: today.date, nazemQueueDate: today.date,
        nazemActionableDate: oldDate, status: 'pending', surah_from: task.fromSurah, verse_from: task.fromAyah,
        surah_to: task.toSurah, verse_to: task.toAyah };
      await connection.query(`INSERT INTO nazem_daily_follow_up_links
        (ruwasi_plan_id, ruwasi_student_id, teacher_id, follow_up_date, task_type, track, sync_status, remote_snapshot)
        VALUES (?, ?, ?, ?, 'memorization', 'memorization', 'synced', ?)`,
      [plan.id, student.insertId, teacher.id, sourceDate, JSON.stringify(snapshot)]);
    }
    const session = { sessionId: crypto.randomUUID(), studentId: student.insertId, sessionDate: today.date,
      deviceId: 'isolated-test-device', bootId: 'isolated-test-boot', eventMonotonicMs: 100,
      committedAtLocal: new Date().toISOString(), createdAtLocal: new Date().toISOString(),
      tasks: [{ taskId: task.id, planId: plan.id, planVersion: today.plan.planVersion,
        payload: { warningCount: 0, mistakeCount: 0, evaluationMode: 'count', compensation: false } }] };
    // Enabled fixture still rejects skipping the open old day.
    await connection.query(`INSERT INTO app_settings (setting_key, setting_value)
      VALUES ('nazemIntegrationEnabled', 'true'), ('recitationAmountDayBeforeNazem', 'same_day')
      ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`);
    assert.equal(await validateNazemLateSession(connection, session, teacher.id), false);
    if (scenario === 'disabled') {
      await api('/nazem/config', manager.token, { enabled: false }, 'PUT');
    } else if (scenario === 'blocked') {
      await connection.query("UPDATE nazem_accounts SET status = 'blocked' WHERE teacher_id = ?", [teacher.id]);
    } else {
      await api(`/nazem/accounts/${teacher.id}`, manager.token, undefined, 'DELETE');
    }
    await api('/offline-recitation/batch', null, { sessions: [session] }, 'POST', 401);
    const response = await api('/offline-recitation/batch', teacher.token, { sessions: [session] });
    assert.equal(response.results[0].result, 'accepted', JSON.stringify(response));
    assert.ok(response.results[0].tasks.every(item => item.result === 'accepted'));
    const [[before]] = await connection.query('SELECT COUNT(*) AS count FROM student_quran_recitation_attempts WHERE task_id = ?', [task.id]);
    const replay = await api('/offline-recitation/batch', teacher.token, { sessions: [session] });
    assert.equal(replay.results[0].result, 'accepted');
    assert.ok(replay.results[0].tasks.every(item => item.result === 'already_synced'));
    const [[after]] = await connection.query('SELECT COUNT(*) AS count FROM student_quran_recitation_attempts WHERE task_id = ?', [task.id]);
    assert.equal(after.count, before.count, 'Retry cannot duplicate the accepted evaluation');
    const [[old]] = await connection.query('SELECT teacher_completed AS completed FROM student_quran_tasks WHERE id = ?', [oldTask.insertId]);
    assert.equal(old.completed, null, 'Today can be approved without completing historical Nazem backlog');
    const [[history]] = await connection.query('SELECT COUNT(*) AS count FROM nazem_daily_follow_up_links WHERE ruwasi_plan_id = ?', [plan.id]);
    assert.equal(history.count, 2, 'Historical snapshots remain intact');
    const [[jobs]] = await connection.query("SELECT COUNT(*) AS count FROM nazem_sync_jobs WHERE student_id = ? AND operation_type = 'recitation.submit'", [student.insertId]);
    assert.equal(jobs.count, 0, 'Detached recitation cannot enqueue a remote write');
    process.stdout.write(`${scenario}: accepted today's recitation with retained Nazem history; replay remained idempotent.\n`);
  }
} finally { await connection.end(); }
