import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import process from 'node:process';
import { URL } from 'node:url';
import mysql from 'mysql2/promise';

// Local, explicit audit configuration; never load application environment files.
const base = process.env.QURAN_TEST_API_URL;
const database = process.env.QURAN_TEST_MYSQL_DATABASE;
assert.equal(new URL(base).hostname, '127.0.0.1');
assert.match(database || '', /^quran_audit_local_approval_[a-z0-9_]+$/);
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
  await api('/nazem/config', manager.token, { enabled: false }, 'PUT');
  const settings = await api('/settings', manager.token);
  await api('/settings', manager.token, { ...settings, weeklyHolidayDays: [], recitationSessionDays: [0, 1, 2, 3, 4, 5, 6],
    recitationAmountDay: 'same_day', memorizationExecutionSource: 'both', reviewExecutionSource: 'both', linkExecutionSource: 'both' }, 'PUT');
  const [committee] = await connection.query('INSERT INTO committees (name) VALUES (?)', [`اعتماد محلي ${run}`]);
  const createTeacher = async suffix => {
    const number = `approval-teacher-${run}-${suffix}`;
    await connection.query('INSERT INTO supervisors (name, login_number, national_id, phone, job_title, role) VALUES (?, ?, ?, ?, ?, ?)',
      ['معلم اعتماد محلي', number, number, '', 'معلم', 'supervisor']);
    return login(number);
  };
  const teacher = await createTeacher('own');
  const foreign = await createTeacher('foreign');
  await connection.query('INSERT INTO supervisor_committees (supervisor_id, committee_id) VALUES (?, ?)', [teacher.id, committee.insertId]);
  await api('/recitation-preferences/me', teacher.token,
    { memorizationMode: 'count', masteryMode: 'count', reviewMode: 'count', linkMode: 'count' }, 'PUT');
  for (const type of ['memorization', 'review']) {
    const number = `approval-${run}-${type}`;
    const [student] = await connection.query('INSERT INTO students (name, login_number, national_id, guardian_phone, committee_id) VALUES (?, ?, ?, ?, ?)',
      ['طالب اعتماد محلي', number, number, '', committee.insertId]);
    const plan = await api(`/student-plans/${student.insertId}`, manager.token,
      { startPage: 22, endPage: 40, dailyPages: 1, linkPages: 2, reviewPages: 5, priorMemorization: [{ startPage: 2, endPage: 21 }] }, 'PUT');
    const today = await api(`/students/${student.insertId}/quran-today`, (await login(number)).token);
    await connection.query('INSERT INTO attendance_records (student_id, record_date, status) VALUES (?, ?, ?)', [student.insertId, today.date, 'present']);
    const evaluation = await api(`/supervisors/${teacher.id}/quran-evaluation`, teacher.token);
    const tasks = evaluation.tasks.filter(task => task.studentId === student.insertId && task.taskType === type);
    assert.ok(tasks.length);
    const endpoint = task => `/supervisors/${teacher.id}/quran-evaluation/${task.id}`;
    const payload = { date: today.date, notMemorized: true, evaluationMode: 'count', requestId: crypto.randomUUID() };
    await api(endpoint(tasks[0]), null, payload, 'POST', 401);
    await api(endpoint(tasks[0]), manager.token, payload, 'POST', 403);
    await api(`/supervisors/${foreign.id}/quran-evaluation/${tasks[0].id}`, foreign.token, payload, 'POST', 404);
    for (const task of tasks) {
      const body = { ...payload, requestId: crypto.randomUUID(),
        groupEvaluation: { taskIds: tasks.map(item => item.id), warningCount: 0, mistakeCount: 0 } };
      const result = await api(endpoint(task), teacher.token, body);
      assert.equal(result.evaluationScore, 0);
      assert.equal(result.teacherCompleted, false);
      assert.equal(result.syncStatus, 'synced');
      const replay = await api(endpoint(task), teacher.token, body);
      assert.equal(Number(replay.evaluationScore), 0);
      assert.equal(replay.attemptNumber, result.attemptNumber);
    }
    const [persisted] = await connection.query('SELECT teacher_completed AS completed, evaluation_score AS score FROM student_quran_tasks WHERE id IN (?)', [tasks.map(task => task.id)]);
    assert.ok(persisted.every(task => task.completed === 0 && Number(task.score) === 0));
    const fresh = await api(`/supervisors/${teacher.id}/quran-evaluation`, teacher.token);
    const state = fresh.students.find(item => item.studentId === student.insertId);
    assert.equal(state.recitationPending, false);
    assert.equal(state.recitationSyncFailed, false);
    assert.ok(fresh.deliveryReceipts.filter(item => item.studentId === student.insertId).every(item => item.status === 'server_saved'));
    const [[remoteJobs]] = await connection.query("SELECT COUNT(*) AS count FROM nazem_sync_jobs WHERE student_id = ? AND operation_type = 'recitation.submit'", [student.insertId]);
    assert.equal(remoteJobs.count, 0);
    const [[attempt]] = await connection.query('SELECT id FROM student_quran_recitation_attempts WHERE task_id = ? AND is_official = 1 ORDER BY id DESC LIMIT 1', [tasks[0].id]);
    const [historicalDay] = await connection.query(`INSERT INTO nazem_daily_follow_up_links
      (ruwasi_plan_id, ruwasi_student_id, teacher_id, follow_up_date, task_type, track, sync_status, remote_snapshot)
      VALUES (?, ?, ?, ?, ?, 'memorization', 'failed', ?)`,
    [plan.id, student.insertId, teacher.id, today.date, type, JSON.stringify({ status: 'pending' })]);
    const ghostId = crypto.randomUUID();
    await connection.query(`INSERT INTO nazem_sync_jobs
      (sync_uuid, idempotency_key, operation_type, entity_type, entity_id, teacher_id, student_id, status, payload_json, last_error_code, last_error)
      VALUES (?, ?, 'recitation.submit', 'recitation_day', ?, ?, ?, 'failed', ?, 'NAZEM_PREVIOUS_DAYS_BLOCKING', 'old remote failure')`,
    [ghostId, ghostId, historicalDay.insertId, teacher.id, student.insertId, JSON.stringify({ attemptId: attempt.id })]);
    const withHistory = await api(`/supervisors/${teacher.id}/quran-evaluation`, teacher.token);
    const localState = withHistory.students.find(item => item.studentId === student.insertId);
    assert.equal(localState.recitationPending, false, 'Historical Nazem queue does not make a local evaluation pending');
    assert.equal(localState.recitationSyncFailed, false);
    assert.equal(localState.recitationSyncErrorCode, null);
    assert.ok(plan.id);
    process.stdout.write(`${type}: zero score, direct approval, idempotent replay, authorization and ignored historical Nazem failures passed.\n`);
  }
} finally { await connection.end(); }
