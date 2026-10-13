import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import process from 'node:process';
import mysql from 'mysql2/promise';
import { countRecitationPayload } from '../shared/recitation-group-evaluation.js';
import { parseReviewExecution } from '../shared/quran-review-cycle.js';
import { calculateGroupRecitationOutcome } from '../shared/recitation-group-evaluation.js';

const database = process.env.QURAN_TEST_MYSQL_DATABASE;
const base = process.env.QURAN_TEST_API_URL;
assert.match(database || '', /^quran_audit_[a-z0-9_]+$/);
assert.equal(new globalThis.URL(base).hostname, '127.0.0.1');
const registration = process.env.QURAN_TEST_REGISTRATION;
const connection = await mysql.createConnection({ host: '127.0.0.1', port: Number(process.env.QURAN_TEST_MYSQL_PORT), user: process.env.QURAN_TEST_MYSQL_USER, database });
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
  await api('/settings', manager.token, { ...settings, pointsSystemEnabled: true, nazemIntegrationEnabled: false, weeklyHolidayDays: [], recitationSessionDays: [0, 1, 2, 3, 4, 5, 6],
    recitationAmountDay: 'same_day', memorizationExecutionSource: 'both', reviewExecutionSource: 'both', linkExecutionSource: 'both' }, 'PUT');
  const run = crypto.randomBytes(5).toString('hex');
  const [committee] = await connection.query('INSERT INTO committees (name) VALUES (?)', [`تسميع محلي ${run}`]);
  const [teacherRow] = await connection.query('INSERT INTO supervisors (name,login_number,national_id,phone,job_title,role) VALUES (?,?,?,?,?,?)',
    [`معلم ${run}`, `t${run}`, `t${run}`, '', 'معلم', 'supervisor']);
  await connection.query('INSERT INTO supervisor_committees (supervisor_id,committee_id) VALUES (?,?)', [teacherRow.insertId, committee.insertId]);
  const teacher = await login(`t${run}`);
  await api('/recitation-preferences/me', teacher.token, { memorizationMode: 'count', masteryMode: 'count', reviewMode: 'count', linkMode: 'count' }, 'PUT');
  const createStudent = async suffix => {
    const [student] = await connection.query('INSERT INTO students (name,login_number,national_id,guardian_phone,committee_id) VALUES (?,?,?,?,?)',
      [`طالب ${suffix}`, `s${run}${suffix}`, `s${run}${suffix}`, '', committee.insertId]);
    await api(`/student-plans/${student.insertId}`, manager.token, { startPage: 22, endPage: 40, dailyPages: 1, linkPages: 2, reviewPages: 5,
      priorMemorization: [{ startPage: 2, endPage: 21 }] }, 'PUT');
    const studentLogin = await login(`s${run}${suffix}`);
    const today = await api(`/students/${student.insertId}/quran-today`, studentLogin.token);
    await connection.query('INSERT IGNORE INTO attendance_records (student_id,record_date,status) VALUES (?,?,?)', [student.insertId, today.date, 'present']);
    const evaluation = await api(`/supervisors/${teacher.id}/quran-evaluation`, teacher.token);
    return { id: student.insertId, evaluation, tasks: evaluation.tasks.filter(task => task.studentId === student.insertId) };
  };
  for (const [name, desiredFaces] of [['less', 2], ['more', 8]]) {
    const student = await createStudent(name);
    const reviews = student.tasks.filter(task => task.taskType === 'review');
    assert.ok(reviews.length && reviews[0].options.length, 'local review must expose endpoint choices');
    const option = reviews[0].options.reduce((best, item) => Math.abs(item.reviewFaces - desiredFaces) < Math.abs(best.reviewFaces - desiredFaces) ? item : best);
    const rangePath = `/supervisors/${teacher.id}/quran-evaluation/${reviews[0].id}/range`;
    const body = { taskIds: reviews.map(task => task.id), date: student.evaluation.date, actualEnd: option };
    await api(rangePath, null, body, 'POST', 401);
    await api(rangePath, manager.token, body, 'POST', 403);
    await api(rangePath, teacher.token, { ...body, actualEnd: { surah: 114, ayah: 999 } }, 'POST', 422);
    const prepared = await api(rangePath, teacher.token, body);
    assert.deepEqual(prepared.taskIds.sort((a,b) => a-b), reviews.map(task => task.id).sort((a,b) => a-b));
    assert.deepEqual(prepared.tasks.map(task => task.targetPages).sort(), reviews.map(task => task.targetPages).sort());
    const faces = prepared.tasks.map(task => parseReviewExecution(task.reviewExecution)).find(Boolean).faces;
    const expectedFaces = reviews.reduce((sum, task) => sum + task.targetPages, 0);
    const itemCounts = { [Math.min(...reviews.map(task => task.id))]: { warningCount: 0, mistakeCount: 0 } };
    await api(`/supervisors/${teacher.id}/quran-evaluation/${prepared.tasks[0].id}`, teacher.token,
      { ...countRecitationPayload(prepared.tasks[0], prepared.tasks, itemCounts), date: student.evaluation.date,
        evaluationMode: 'count', requestId: crypto.randomUUID(), groupEvaluation: { taskIds: [999999], warningCount: 0, mistakeCount: 0 } }, 'POST', 422);
    const results = [];
    for (const task of prepared.tasks) {
      const payload = { ...countRecitationPayload(task, prepared.tasks, itemCounts), date: student.evaluation.date, evaluationMode: 'count', requestId: crypto.randomUUID() };
      const result = await api(`/supervisors/${teacher.id}/quran-evaluation/${task.id}`, teacher.token, payload);
      assert.equal(result.teacherCompleted, true);
      assert.equal(result.evaluationScore, Math.round(result.evaluationMaxScore * Math.min(1, faces / expectedFaces)));
      const replay = await api(`/supervisors/${teacher.id}/quran-evaluation/${task.id}`, teacher.token, payload);
      assert.equal(Number(replay.evaluationScore), result.evaluationScore, 'retry returns the original score');
      assert.equal(replay.attemptNumber, result.attemptNumber);
      results.push(result);
    }
    const [[reward]] = await connection.query('SELECT SUM(points) AS points FROM student_quran_tasks WHERE id IN (?)', [reviews.map(task => task.id)]);
    assert.equal(Number(reward.points), results[0].evaluationScore);
    globalThis.console.log(JSON.stringify({ scenario: name, actualFaces: faces, expectedFaces, score: results[0].evaluationScore, reward: reward.points }));
  }
  const fullStudent = await createStudent('full');
  const fullReviews = fullStudent.tasks.filter(task => task.taskType === 'review');
  const fullCounts = { [Math.min(...fullReviews.map(task => task.id))]: { warningCount: 0, mistakeCount: 0 } };
  for (const task of fullReviews) {
    const result = await api(`/supervisors/${teacher.id}/quran-evaluation/${task.id}`, teacher.token,
      { ...countRecitationPayload(task, fullReviews, fullCounts), evaluationMode: 'count', date: fullStudent.evaluation.date, requestId: crypto.randomUUID() });
    assert.equal(result.evaluationScore, result.evaluationMaxScore, 'an unchanged completed review gets its full score');
  }
  const student = await createStudent('link');
  const compensationStudent = await createStudent('compensation');
  const oldByType = {};
  for (const type of ['memorization', 'review']) {
    const daily = compensationStudent.tasks.filter(task => task.taskType === type);
    oldByType[type] = [];
    for (const task of daily) {
      const [old] = await connection.query(`INSERT INTO student_quran_tasks
        (plan_id,student_id,task_date,task_type,track,from_page,to_page,from_surah,from_ayah,to_surah,to_ayah,target_pages)
        SELECT plan_id,student_id,DATE_SUB(task_date,INTERVAL 1 DAY),task_type,track,from_page,to_page,from_surah,from_ayah,to_surah,to_ayah,target_pages
        FROM student_quran_tasks WHERE id = ?`, [task.id]);
      oldByType[type].push(old.insertId);
    }
    assert.ok(oldByType[type].length);
  }
  await api('/settings', manager.token, { ...await api('/settings', manager.token), allowQuranCompensation: true }, 'PUT');
  const withCompensation = await api(`/supervisors/${teacher.id}/quran-evaluation`, teacher.token);
  const oldIds = Object.values(oldByType).flat();
  assert.ok(!withCompensation.tasks.some(task => oldIds.includes(task.id)), 'ordinary actions must contain only the daily lesson');
  assert.deepEqual(withCompensation.compensationTasks.filter(task => task.studentId === compensationStudent.id).map(task => task.id).sort((a, b) => a - b), oldIds.sort((a, b) => a - b), 'identical amounts on different days remain independently actionable');
  const oldMemorization = withCompensation.compensationTasks.filter(task => oldByType.memorization.includes(task.id));
  const oldAnchor = oldMemorization[0];
  const ratingPath = `/supervisors/${teacher.id}/quran-evaluation/${oldAnchor.id}`;
  const oldRangePath = `${ratingPath}/range`;
  const oldBody = { evaluationMode: 'count', date: compensationStudent.evaluation.date, compensation: true, warningCount: 0, mistakeCount: 0, requestId: crypto.randomUUID() };
  await api(ratingPath, null, oldBody, 'POST', 401);
  await api(ratingPath, manager.token, oldBody, 'POST', 403);
  await api(ratingPath, teacher.token, { ...oldBody, compensation: false }, 'POST', 422);
  const oldRange = { date: oldBody.date, compensation: true, taskIds: oldByType.memorization, actualEnd: { surah: oldAnchor.toSurah, ayah: oldAnchor.toAyah } };
  await api(oldRangePath, teacher.token, { ...oldRange, compensation: false }, 'POST', 422);
  await api('/settings', manager.token, { ...await api('/settings', manager.token), allowQuranCompensation: false }, 'PUT');
  await api(ratingPath, teacher.token, oldBody, 'POST', 403);
  await api(oldRangePath, teacher.token, oldRange, 'POST', 403);
  await api('/settings', manager.token, { ...await api('/settings', manager.token), allowQuranCompensation: true }, 'PUT');
  await api(oldRangePath, teacher.token, oldRange);
  for (const type of ['memorization', 'review']) {
    const group = withCompensation.compensationTasks.filter(task => oldByType[type].includes(task.id));
    const itemCounts = { [Math.min(...group.map(task => task.id))]: { warningCount: 1, mistakeCount: 1 } };
    let firstScore;
    for (const task of group) {
      const body = { ...countRecitationPayload(task, group, itemCounts), date: oldBody.date, compensation: true, evaluationMode: 'count', requestId: crypto.randomUUID() };
      const result = await api(`/supervisors/${teacher.id}/quran-evaluation/${task.id}`, teacher.token, body);
      firstScore ??= result.evaluationScore;
      const replay = await api(`/supervisors/${teacher.id}/quran-evaluation/${task.id}`, teacher.token, body);
      assert.equal(replay.attemptNumber, result.attemptNumber);
      assert.equal(Number(replay.evaluationScore), result.evaluationScore);
    }
    const [[recorded]] = await connection.query('SELECT SUM(points) points, SUM(warning_count) warnings, SUM(mistake_count) mistakes FROM student_quran_tasks WHERE id IN (?)', [group.map(task => task.id)]);
    assert.equal(Number(recorded.points), firstScore, 'compensation records its reward once');
    assert.equal(Number(recorded.warnings), 1);
    assert.equal(Number(recorded.mistakes), 1);
  }
  const afterCompensation = await api(`/supervisors/${teacher.id}/quran-evaluation`, teacher.token);
  assert.ok(!afterCompensation.compensationTasks.some(task => oldIds.includes(task.id)), 'completed compensation disappears');
  const remainingDaily = afterCompensation.tasks.filter(task => task.studentId === compensationStudent.id);
  assert.deepEqual(remainingDaily.map(task => task.taskType).sort(), compensationStudent.tasks.map(task => task.taskType).sort(), 'all daily actions remain independently available after compensation');
  assert.ok(remainingDaily.every(task => task.taskDate === oldBody.date && task.teacherCompleted !== true));
  assert.deepEqual(remainingDaily.filter(task => task.taskType === 'memorization').map(task => task.id), compensationStudent.tasks.filter(task => task.taskType === 'memorization').map(task => task.id), 'compensation never consumes the same memorization amount scheduled today');
  const todayTask = compensationStudent.tasks.find(task => task.taskType === 'memorization');
  await api(`/supervisors/${teacher.id}/quran-evaluation/${todayTask.id}`, teacher.token, { ...oldBody, requestId: crypto.randomUUID() }, 'POST', 422);
  globalThis.console.log('Daily and compensation scopes: separate dates, independent amounts, authorization, disabled permission, one reward and idempotent retries passed.');
  const links = student.tasks.filter(task => task.taskType === 'link');
  assert.ok(links.length);
  const counts = { [Math.min(...links.map(task => task.id))]: { warningCount: 1, mistakeCount: 1 } };
  for (const task of links) await api(`/supervisors/${teacher.id}/quran-evaluation/${task.id}`, teacher.token,
    { ...countRecitationPayload(task, links, counts), evaluationMode: 'count', date: student.evaluation.date, requestId: crypto.randomUUID() });
  const [[recorded]] = await connection.query('SELECT SUM(warning_count) warnings, SUM(mistake_count) mistakes FROM student_quran_tasks WHERE id IN (?)', [links.map(task => task.id)]);
  assert.equal(Number(recorded.warnings), 1); assert.equal(Number(recorded.mistakes), 1);
  const [oldLink] = await connection.query(`INSERT INTO student_quran_tasks
    (plan_id,student_id,task_date,task_type,track,from_page,to_page,from_surah,from_ayah,to_surah,to_ayah,target_pages)
    SELECT plan_id,student_id,DATE_SUB(task_date,INTERVAL 1 DAY),task_type,track,from_page,from_page,from_surah,from_ayah,from_surah,from_ayah,0.25
    FROM student_quran_tasks WHERE id = ?`, [links[0].id]);
  await api(`/supervisors/${teacher.id}/quran-evaluation/${oldLink.insertId}`, teacher.token,
    { evaluationMode: 'count', date: student.evaluation.date, warningCount: 0, mistakeCount: 0, requestId: crypto.randomUUID() }, 'POST', 422);
  const refreshed = await api(`/supervisors/${teacher.id}/quran-evaluation`, teacher.token);
  assert.ok(!refreshed.tasks.some(task => Number(task.id) === Number(oldLink.insertId)), 'past linking must not reappear as compensation');
  await api('/recitation-preferences/me', teacher.token, { memorizationMode: 'count', masteryMode: 'count', reviewMode: 'mushaf', linkMode: 'count' }, 'PUT');
  const mushafStudent = await createStudent('mushaf');
  const reviews = mushafStudent.tasks.filter(task => task.taskType === 'review');
  const option = reviews[0].options.reduce((best, item) => Math.abs(item.reviewFaces - 2) < Math.abs(best.reviewFaces - 2) ? item : best);
  const prepared = await api(`/supervisors/${teacher.id}/quran-evaluation/${reviews[0].id}/range`, teacher.token,
    { taskIds: reviews.map(task => task.id), date: mushafStudent.evaluation.date, actualEnd: option });
  const anchor = prepared.tasks.find(task => parseReviewExecution(task.reviewExecution));
  const data = await api(`/supervisors/${teacher.id}/quran-evaluation/${anchor.id}/ayahs`, teacher.token);
  const allowed = new Set(data.ayahs.map(ayah => `${ayah.surah}:${ayah.ayah}`));
  const word = data.pages.flatMap(page => page.words).find(item => allowed.has(item.verseKey) && item.charType === 'word');
  assert.ok(word);
  const mark = { page: word.page, startLocation: word.location, endLocation: word.location, markType: 'warning' };
  const wordMarksByTask = Object.fromEntries(prepared.tasks.map(task => [String(task.id), task.id === anchor.id ? [mark] : []]));
  const groupEvaluation = { taskIds: prepared.taskIds, warningCount: 0, mistakeCount: 0, wordMarksByTask };
  const body = { date: mushafStudent.evaluation.date, evaluationMode: 'mushaf', requestId: crypto.randomUUID(), groupEvaluation, wordMarks: [mark] };
  await api(`/supervisors/${teacher.id}/quran-evaluation/${anchor.id}`, teacher.token,
    { ...body, wordMarks: [{ ...mark, startLocation: '999:999:999' }] }, 'POST', 422);
  const actualFaces = parseReviewExecution(anchor.reviewExecution).faces;
  const expectedFaces = reviews.reduce((sum, task) => sum + task.targetPages, 0);
  const expected = calculateGroupRecitationOutcome({ policy: mushafStudent.evaluation.evaluationPolicies.review,
    taskType: 'review', evaluatedFaces: actualFaces, expectedFaces, warningCount: 1, mistakeCount: 0 });
  for (const task of prepared.tasks) {
    const result = await api(`/supervisors/${teacher.id}/quran-evaluation/${task.id}`, teacher.token,
      { ...body, requestId: crypto.randomUUID(), wordMarks: wordMarksByTask[String(task.id)] });
    assert.equal(result.evaluationScore, expected.score, 'group scores must use validated word marks');
  }
  globalThis.console.log('Isolated MySQL/API: complete/partial/extra review, capped points, replay, invalid ranges, unauthorized access, grouped linking, compensation rejection and validated Mushaf marks passed.');
} finally { await connection.end(); }
