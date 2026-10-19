import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import mysql from 'mysql2/promise';
import { countRecitationPayload } from '../shared/recitation-group-evaluation.js';
import { parseReviewExecution } from '../shared/quran-review-cycle.js';

const base = process.env.QURAN_TEST_API_URL;
const database = process.env.QURAN_TEST_MYSQL_DATABASE;
assert.equal(new globalThis.URL(base).hostname, '127.0.0.1');
assert.match(database || '', /^quran_audit_recitation_recovery$/);
assert.equal(process.env.QURAN_TEST_MYSQL_PORT, '33320');
const registration = process.env.QURAN_TEST_REGISTRATION;
const db = await mysql.createConnection({ host: '127.0.0.1', port: 33320, user: process.env.QURAN_TEST_MYSQL_USER, database });
const run = crypto.randomBytes(5).toString('hex');
const evidence = [];
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
  const settings = await api('/settings', manager.token);
  await api('/settings', manager.token, { ...settings, nazemIntegrationEnabled: false, pointsSystemEnabled: true,
    quranReferenceMode: 'ayah', weeklyHolidayDays: [], recitationSessionDays: [0, 1, 2, 3, 4, 5, 6],
    recitationAmountDay: 'same_day', memorizationExecutionSource: 'both', reviewExecutionSource: 'both', linkExecutionSource: 'both' }, 'PUT');
  const [committee] = await db.query('INSERT INTO committees (name) VALUES (?)', [`حلقة اختبار الاستعادة ${run}`]);
  const teacherLogin = `recovery-teacher-${run}`;
  const foreignLogin = `recovery-foreign-${run}`;
  for (const number of [teacherLogin, foreignLogin]) await db.query(
    'INSERT INTO supervisors (name,login_number,national_id,phone,job_title,role) VALUES (?,?,?,?,?,?)',
    ['معلم اختبار الاستعادة', number, number, '', 'معلم', 'supervisor']);
  const teacher = await login(teacherLogin), foreign = await login(foreignLogin);
  await db.query('INSERT INTO supervisor_committees (supervisor_id,committee_id) VALUES (?,?)', [teacher.id, committee.insertId]);
  await api('/recitation-preferences/me', teacher.token, { memorizationMode: 'count', masteryMode: 'count', reviewMode: 'count', linkMode: 'count' }, 'PUT');
  const fixtures = [];
  for (const direction of [1, -1]) {
    const number = `recovery-student-${run}-${direction}`;
    const [student] = await db.query('INSERT INTO students (name,login_number,national_id,guardian_phone,committee_id) VALUES (?,?,?,?,?)',
      [`طالب الاستعادة ${direction < 0 ? 'التنازلي' : 'التصاعدي'}`, number, number, '', committee.insertId]);
    const planBody = direction > 0
      ? { startPage: 6, endPage: 12, dailyPages: 0.5, linkPages: 1, reviewPages: 20, priorMemorization: [{ startPage: 2, endPage: 5 }] }
      : { startSurah: 109, startAyah: 1, endSurah: 100, endAyah: 11, dailyPages: 0.5, linkPages: 1, reviewPages: 20,
        priorMemorization: [{ startSurah: 110, startAyah: 1, endSurah: 114, endAyah: 6 }, { startPage: 590, endPage: 592 }] };
    await api(`/student-plans/${student.insertId}`, manager.token, { ...planBody, reviewPages: 1209 }, 'PUT', 422);
    const plan = await api(`/student-plans/${student.insertId}`, manager.token, planBody, 'PUT');
    const today = await api(`/students/${student.insertId}/quran-today`, (await login(number)).token);
    await db.query('INSERT INTO attendance_records (student_id,record_date,status) VALUES (?,?,?)', [student.insertId, today.date, 'present']);
    let evaluation = await api(`/supervisors/${teacher.id}/quran-evaluation`, teacher.token);
    let tasks = evaluation.tasks.filter(task => Number(task.studentId) === student.insertId);
    const reviews = tasks.filter(task => task.taskType === 'review');
    assert.ok(reviews.length, 'review must remain available for a nonempty memorized pool');
    assert.equal(reviews.reduce((sum, task) => sum + Number(task.targetPages), 0), 20);
    const anchor = reviews[0];
    const prepared = await api(`/supervisors/${teacher.id}/quran-evaluation/${anchor.id}/ayahs`, teacher.token);
    assert.ok(prepared);
    await api(`/supervisors/${foreign.id}/quran-evaluation/${anchor.id}/ayahs`, foreign.token, null, 'GET', 404);
    const memorization = tasks.filter(task => task.taskType === 'memorization');
    assert.ok(memorization.length);
    for (const task of memorization) {
      await api(`/supervisors/${teacher.id}/quran-evaluation/${task.id}`, teacher.token,
        { date: today.date, evaluationMode: 'count', ...countRecitationPayload(task, memorization, { [memorization[0].id]: { warningCount: 0, mistakeCount: 0 } }), requestId: crypto.randomUUID() });
    }
    evaluation = await api(`/supervisors/${teacher.id}/quran-evaluation`, teacher.token);
    tasks = evaluation.tasks.filter(task => Number(task.studentId) === student.insertId);
    const links = tasks.filter(task => task.taskType === 'link');
    assert.ok(links.length);
    const [[last]] = await db.query(`SELECT COALESCE(actual_to_surah,to_surah) AS surah, COALESCE(actual_to_ayah,to_ayah) AS ayah
      FROM student_quran_tasks WHERE student_id=? AND task_type='memorization' AND teacher_completed=1 ORDER BY evaluated_at DESC,id DESC LIMIT 1`, [student.insertId]);
    assert.ok(links.some(task => Number(task.fromSurah) === Number(last.surah) || Number(task.toSurah) === Number(last.surah)), 'link must reach the last save approved today');
    for (const task of links) {
      const path = `/supervisors/${teacher.id}/quran-evaluation/${task.id}`;
      const payload = { date: today.date, evaluationMode: 'count', notMemorized: true, requestId: crypto.randomUUID() };
      await api(path, null, payload, 'POST', 401);
      await api(path, manager.token, payload, 'POST', 403);
      await api(`/supervisors/${foreign.id}/quran-evaluation/${task.id}`, foreign.token, payload, 'POST', 404);
      const result = await api(path, teacher.token, payload);
      assert.equal(result.teacherCompleted, false);
      assert.equal(result.teacherRatingLabel, 'لم يتم الربط');
      const replay = await api(path, teacher.token, payload);
      assert.equal(replay.duplicate, true);
    }
    const [[linkTotals]] = await db.query("SELECT SUM(points) AS points, MAX(teacher_completed) AS completed FROM student_quran_tasks WHERE student_id=? AND task_type='link' AND task_date=?", [student.insertId, today.date]);
    assert.equal(Number(linkTotals.points), 0); assert.equal(Number(linkTotals.completed), 0);
    fixtures.push({ studentId: student.insertId, name: `طالب الاستعادة ${direction < 0 ? 'التنازلي' : 'التصاعدي'}`,
      reviewTaskIds: reviews.map(task => task.id), planId: plan.id || plan.plan?.id });
    evidence.push({ direction, fixedReviewFaces: 20, negativeLinkPoints: 0, sameDayLinkUpdated: true, permissionChecks: true, idempotency: true });
  }
  const defaultStudent = fixtures[0];
  const [defaultReviews] = await db.query("SELECT id, target_pages AS targetPages FROM student_quran_tasks WHERE student_id=? AND task_type='review' AND teacher_completed IS NULL", [defaultStudent.studentId]);
  await db.query('UPDATE student_quran_tasks SET review_execution_json=NULL WHERE id IN (?)', [defaultReviews.map(task => task.id)]);
  for (const task of defaultReviews) await api(`/supervisors/${teacher.id}/quran-evaluation/${task.id}`, teacher.token,
    { date: new Date().toISOString().slice(0, 10), evaluationMode: 'count', requestId: crypto.randomUUID(),
      groupEvaluation: { taskIds: defaultReviews.map(item => item.id), warningCount: 0, mistakeCount: 0 }, warningCount: 0, mistakeCount: 0 });
  const [[defaultPath]] = await db.query('SELECT review_execution_json AS path FROM student_quran_tasks WHERE id=?', [defaultReviews[0].id]);
  assert.equal(parseReviewExecution(defaultPath.path).faces, 20);
  evidence[0].defaultReviewPathRetained = true;
  const uiLogin = `recovery-ui-link-${run}`;
  const [uiStudent] = await db.query('INSERT INTO students (name,login_number,national_id,guardian_phone,committee_id) VALUES (?,?,?,?,?)',
    ['طالب فحص خيار الربط', uiLogin, uiLogin, '', committee.insertId]);
  await api(`/student-plans/${uiStudent.insertId}`, manager.token,
    { startPage: 6, endPage: 12, dailyPages: 0.5, linkPages: 1, reviewPages: 20, priorMemorization: [{ startPage: 2, endPage: 5 }] }, 'PUT');
  const uiToday = await api(`/students/${uiStudent.insertId}/quran-today`, (await login(uiLogin)).token);
  await db.query('INSERT INTO attendance_records (student_id,record_date,status) VALUES (?,?,?)', [uiStudent.insertId, uiToday.date, 'present']);
  const invalid = await api('/offline-recitation/batch', teacher.token, { sessions: [{ sessionId: crypto.randomUUID(), studentId: fixtures[0].studentId,
    sessionDate: new Date().toISOString().slice(0, 10), tasks: [{ taskId: 999999999, planId: 999 }] }] });
  assert.equal(invalid.results[0].code, 'RECITATION_TASK_UNAVAILABLE');
  assert.equal(invalid.results[0].result, 'conflict');
  await mkdir('outputs/recitation-recovery', { recursive: true });
  await writeFile('outputs/recitation-recovery/fixture.json', JSON.stringify({ teacherLogin, teacherId: teacher.id, registration, fixtures }));
  await writeFile('outputs/recitation-recovery/mysql-evidence.json', JSON.stringify(evidence, null, 2));
  process.stdout.write(`${JSON.stringify(evidence)}\nReal isolated MySQL/API recovery scenarios passed.\n`);
} finally { await db.end(); }
