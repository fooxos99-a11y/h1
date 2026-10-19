import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import process from 'node:process';
import mysql from 'mysql2/promise';
import { shiftDateOnly } from '../shared/business-date.js';

const base = process.env.QURAN_TEST_API_URL;
const database = process.env.QURAN_TEST_MYSQL_DATABASE;
assert.equal(new globalThis.URL(base).hostname, '127.0.0.1');
assert.match(database || '', /^quran_audit_[a-z0-9_]+$/);
assert.ok(process.env.QURAN_TEST_MYSQL_USER && process.env.QURAN_TEST_MYSQL_PORT);
const registration = process.env.QURAN_TEST_REGISTRATION;
const connection = await mysql.createConnection({ host: '127.0.0.1', port: Number(process.env.QURAN_TEST_MYSQL_PORT),
  user: process.env.QURAN_TEST_MYSQL_USER, password: process.env.QURAN_TEST_MYSQL_PASSWORD || '', database });
const run = crypto.randomBytes(5).toString('hex');
async function api(path, token, body, method = body ? 'POST' : 'GET', expected = 200) {
  const response = await globalThis.fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json',
    'X-Madarij-Native': '1', 'X-Registration-Number': registration,
    ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(result)}`);
  return result;
}
const login = loginNumber => api('/auth/login', null, { loginNumber, registrationNumber: registration });
try {
  const manager = await login(process.env.QURAN_TEST_MANAGER_LOGIN);
  await api('/nazem/config', manager.token, { enabled: false }, 'PUT');
  const settings = await api('/settings', manager.token);
  await api('/settings', manager.token, { ...settings, allowQuranCompensation: true, weeklyHolidayDays: [],
    recitationSessionDays: [0, 1, 2, 3, 4, 5, 6], recitationAmountDay: 'same_day',
    memorizationExecutionSource: 'both', reviewExecutionSource: 'both', linkExecutionSource: 'both' }, 'PUT');
  const [committee] = await connection.query('INSERT INTO committees (name) VALUES (?)', [`اختبار هوية التسميع ${run}`]);
  const teacherNumber = `identity-teacher-${run}`;
  const [teacherRow] = await connection.query('INSERT INTO supervisors (name, login_number, national_id, phone, job_title, role) VALUES (?, ?, ?, ?, ?, ?)',
    ['معلم اختبار', teacherNumber, teacherNumber, '', 'معلم', 'supervisor']);
  await connection.query('INSERT INTO supervisor_committees (supervisor_id, committee_id) VALUES (?, ?)', [teacherRow.insertId, committee.insertId]);
  const teacher = await login(teacherNumber);
  await api('/recitation-preferences/me', teacher.token, { memorizationMode: 'count', masteryMode: 'count', reviewMode: 'count', linkMode: 'count' }, 'PUT');
  for (const taskType of ['memorization', 'review']) {
    const studentNumber = `identity-student-${run}-${taskType}`;
    const [student] = await connection.query('INSERT INTO students (name, login_number, national_id, guardian_phone, committee_id) VALUES (?, ?, ?, ?, ?)',
      ['طالب اختبار', studentNumber, studentNumber, '', committee.insertId]);
    const plan = await api(`/student-plans/${student.insertId}`, manager.token, { startPage: 22, endPage: 40,
      dailyPages: 1, linkPages: 2, reviewPages: 5, priorMemorization: [{ startPage: 2, endPage: 21 }] }, 'PUT');
    const today = await api(`/students/${student.insertId}/quran-today`, (await login(studentNumber)).token);
    await connection.query('INSERT INTO attendance_records (student_id, record_date, status) VALUES (?, ?, ?)', [student.insertId, today.date, 'present']);
    const current = today.tasks.find(task => task.taskType === taskType);
    assert.ok(current);
    const tasks = [];
    for (const offset of [-2, -1]) {
      const taskDate = shiftDateOnly(today.date, offset);
      const [old] = await connection.query(`INSERT INTO student_quran_tasks
        (plan_id, student_id, task_type, track, task_date, from_page, from_surah, from_ayah, to_page, to_surah, to_ayah, target_pages)
        SELECT plan_id, student_id, task_type, track, ?, from_page, from_surah, from_ayah, to_page, to_surah, to_ayah, target_pages
        FROM student_quran_tasks WHERE id = ?`, [taskDate, current.id]);
      tasks.push({ ...current, id: old.insertId, taskDate });
    }
    tasks.push(current);
    for (const [index, task] of tasks.entries()) {
      const session = { sessionId: crypto.randomUUID(), studentId: student.insertId, sessionDate: today.date,
        createdAtLocal: new Date().toISOString(), committedAtLocal: new Date().toISOString(),
        tasks: [{ taskId: task.id, planId: plan.id, planVersion: today.plan.planVersion,
          payload: { compensation: index < 2, evaluationMode: 'count', warningCount: 0, mistakeCount: 0 } }] };
      await api('/offline-recitation/batch', null, { sessions: [session] }, 'POST', 401);
      const rejected = await api('/offline-recitation/batch', manager.token, { sessions: [session] });
      assert.notEqual(rejected.results[0].result, 'accepted');
      const result = await api('/offline-recitation/batch', teacher.token, { sessions: [session] });
      assert.equal(result.results[0].result, 'accepted', JSON.stringify(result));
      // Simulate an accepted lesson persisted by a pre-upgrade server.
      if (index === 0) {
        await connection.query('UPDATE student_quran_recitation_daily_slots SET session_type = ? WHERE session_id = ?', [taskType, session.sessionId]);
        await connection.query('UPDATE student_quran_recitation_submissions SET session_type = ? WHERE session_id = ?', [taskType, session.sessionId]);
      }
      const replay = await api('/offline-recitation/batch', teacher.token, { sessions: [session] });
      assert.equal(replay.results[0].tasks[0].result, 'already_synced', JSON.stringify(replay));
      const [[attempts]] = await connection.query('SELECT COUNT(*) AS count FROM student_quran_recitation_attempts WHERE task_id = ? AND is_official = 1', [task.id]);
      assert.equal(attempts.count, 1);
      const duplicate = await api('/offline-recitation/batch', teacher.token,
        { sessions: [{ ...session, sessionId: `ffffffff-ffff-4fff-afff-${Number(task.id).toString(16).padStart(12, '0')}` }] });
      assert.equal(duplicate.results[0].result, 'rejected_duplicate');
    }
    const [slots] = await connection.query('SELECT session_type FROM student_quran_recitation_daily_slots WHERE student_id = ?', [student.insertId]);
    assert.equal(slots.length, 3);
    // Retain both legacy forms while replacing the plan on the same execution day.
    const oldestType = `${taskType}:${tasks[0].taskDate}:p${plan.id}`;
    for (const table of ['student_quran_recitation_daily_slots', 'student_quran_recitation_submissions']) {
      await connection.query(`UPDATE ${table} SET session_type=? WHERE student_id=? AND session_date=? AND session_type=?`,
        [oldestType, student.insertId, today.date, taskType]);
      await connection.query(`UPDATE ${table} SET session_type=? WHERE student_id=? AND session_date=? AND session_type=?`,
        [taskType, student.insertId, today.date, `${taskType}:${today.date}:p${plan.id}`]);
    }
    const replacement = await api(`/student-plans/${student.insertId}`, manager.token, { startPage: 23, endPage: 40,
      dailyPages: 1, linkPages: 2, reviewPages: 5, priorMemorization: [{ startPage: 2, endPage: 22 }] }, 'PUT');
    assert.notEqual(replacement.id, plan.id);
    const refreshed = await api(`/students/${student.insertId}/quran-today`, (await login(studentNumber)).token);
    const next = refreshed.tasks.find(task => task.taskType === taskType);
    const session = { sessionId: crypto.randomUUID(), studentId: student.insertId, sessionDate: today.date,
      tasks: [{ taskId: next.id, planId: replacement.id, payload: { compensation: false,
        evaluationMode: 'count', warningCount: 0, mistakeCount: 0 } }] };
    const approved = await api('/offline-recitation/batch', teacher.token, { sessions: [session] });
    assert.equal(approved.results[0].result, 'accepted', JSON.stringify(approved));
    const [[prior]] = await connection.query('SELECT COUNT(*) AS count FROM student_quran_recitation_attempts WHERE task_id=? AND is_official=1', [current.id]);
    assert.equal(prior.count, 1, 'The accepted old-plan lesson stays official');
    process.stdout.write(`${taskType}: two compensations, today's lesson, and a replacement plan accepted independently; legacy protection, replay and denied actors passed.\n`);
  }
} finally { await connection.end(); }
