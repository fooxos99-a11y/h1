import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import process from 'node:process';
import { URL } from 'node:url';
import mysql from 'mysql2/promise';

// Explicit local audit configuration only; never load application credentials.
const base = process.env.QURAN_TEST_API_URL;
const database = process.env.QURAN_TEST_MYSQL_DATABASE;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
assert.match(database || '', /^quran_audit_prior_[a-z0-9_]+$/);
assert.ok(process.env.QURAN_TEST_MYSQL_USER && process.env.QURAN_TEST_MYSQL_PORT);
const registration = process.env.QURAN_TEST_REGISTRATION;
const connection = await mysql.createConnection({
  host: '127.0.0.1', port: Number(process.env.QURAN_TEST_MYSQL_PORT),
  user: process.env.QURAN_TEST_MYSQL_USER, password: process.env.QURAN_TEST_MYSQL_PASSWORD || '', database,
});
const run = crypto.randomBytes(5).toString('hex');

async function api(path, token, body, method = body ? 'POST' : 'GET', expected = 200) {
  const response = await globalThis.fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json', 'X-Madarij-Native': '1',
      'X-Registration-Number': registration, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  assert.equal(response.status, expected, `${path}: ${result.message || response.status}`);
  return result;
}
const login = (loginNumber) => api('/auth/login', null, { loginNumber, registrationNumber: registration });
const planInput = { startSurah: 64, startAyah: 1, endSurah: 64, endAyah: 18,
  dailyPages: 1, linkPages: 10, reviewPages: 20 };
const removedRange = { startSurah: 60, startAyah: 1, endSurah: 60, endAyah: 13 };

try {
  const manager = await login(process.env.QURAN_TEST_MANAGER_LOGIN);
  const [committee] = await connection.query('INSERT INTO committees (name) VALUES (?)', [`اختبار حذف المحفوظ ${run}`]);
  const [foreignCommittee] = await connection.query('INSERT INTO committees (name) VALUES (?)', [`حلقة أخرى ${run}`]);
  const teacherNumber = `prior-teacher-${run}`;
  const [teacher] = await connection.query(
    'INSERT INTO supervisors (name, login_number, national_id, phone, job_title, role) VALUES (?, ?, ?, ?, ?, ?)',
    ['معلم اختبار المحفوظ', teacherNumber, teacherNumber, '', 'معلم', 'supervisor'],
  );
  await connection.query('INSERT INTO supervisor_committees (supervisor_id, committee_id) VALUES (?, ?)',
    [teacher.insertId, foreignCommittee.insertId]);
  const foreignTeacher = await login(teacherNumber);
  const [[first]] = await connection.query('SELECT page_number AS page FROM quran_ayah_pages WHERE surah_number = 60 AND ayah_number = 1');
  const [[last]] = await connection.query('SELECT page_number AS page FROM quran_ayah_pages WHERE surah_number = 60 AND ayah_number = 13');
  const deletion = { fromPage: first.page, toPage: last.page };
  const rangeValues = [60, 1, first.page, 60, 13, last.page];
  const createStudent = async () => {
    const number = `prior-${run}-${crypto.randomBytes(3).toString('hex')}`;
    const [student] = await connection.query(
      'INSERT INTO students (name, login_number, national_id, guardian_phone, committee_id) VALUES (?, ?, ?, ?, ?)',
      ['طالب اختبار حذف المحفوظ', number, number, '', committee.insertId],
    );
    const plan = await api(`/student-plans/${student.insertId}`, manager.token,
      { ...planInput, priorMemorization: [removedRange] }, 'PUT');
    await connection.query(`INSERT INTO student_quran_prior_memorization
      (student_id, source, start_surah, start_ayah, start_page, end_surah, end_ayah, end_page)
      VALUES (?, 'registration', ?, ?, ?, ?, ?, ?)`, [student.insertId, ...rangeValues]);
    return { id: student.insertId, planId: plan.id, number };
  };
  const student = await createStudent();
  await api(`/student-plans/${student.id}/prior-memorization`, null, deletion, 'DELETE', 401);
  await api(`/student-plans/${student.id}/prior-memorization`, foreignTeacher.token, deletion, 'DELETE', 403);
  const [[untouched]] = await connection.query('SELECT COUNT(*) AS count FROM student_quran_prior_memorization WHERE student_id = ?', [student.id]);
  assert.equal(untouched.count, 1, 'Unauthorized deletion must not change memorization');
  await api(`/student-plans/${student.id}/prior-memorization`, manager.token, deletion, 'DELETE');
  await api(`/student-plans/${student.id}`, manager.token, undefined, 'DELETE');
  const reproduce = process.env.QURAN_TEST_EXPECT_PRIOR_BUG === '1';
  await api(`/student-plans/${student.id}`, manager.token, { ...planInput, ...removedRange, priorMemorization: [] }, 'PUT', reproduce ? 422 : 200);
  if (reproduce) {
    process.stdout.write('Reproduced: deleted plan memorization still blocks Al-Mumtahanah 1–13 because the registration copy remains.\n');
  } else {
    const [[remaining]] = await connection.query('SELECT COUNT(*) AS count FROM student_quran_prior_memorization WHERE student_id = ?', [student.id]);
    assert.equal(remaining.count, 0);
    const partialStudent = await createStudent();
    assert.ok(last.page - first.page >= 2, 'The selected surah spans at least three pages');
    const middlePage = first.page + 1;
    await api(`/student-plans/${partialStudent.id}/prior-memorization`, manager.token,
      { fromPage: middlePage, toPage: middlePage }, 'DELETE');
    for (const table of ['student_quran_plan_prior_memorization', 'student_quran_prior_memorization']) {
      const [remainders] = await connection.query(`SELECT start_page AS startPage, end_page AS endPage
        FROM ${table} WHERE student_id = ? ORDER BY start_page`, [partialStudent.id]);
      assert.deepEqual(remainders, [{ startPage: first.page, endPage: middlePage - 1 }, { startPage: middlePage + 1, endPage: last.page }]);
    }
    const [sources] = await connection.query('SELECT source FROM student_quran_prior_memorization WHERE student_id = ?', [partialStudent.id]);
    assert.ok(sources.every(row => row.source === 'registration'));
    const approvedStudent = await createStudent();
    await connection.query(`INSERT INTO student_quran_tasks
      (plan_id, student_id, task_type, task_date, from_surah, from_ayah, from_page, to_surah, to_ayah, to_page, teacher_completed)
      VALUES (?, ?, 'memorization', '2026-10-12', ?, ?, ?, ?, ?, ?, 1)`,
    [approvedStudent.planId, approvedStudent.id, ...rangeValues]);
    await api(`/student-plans/${approvedStudent.id}/prior-memorization`, manager.token, deletion, 'DELETE');
    const [[approved]] = await connection.query('SELECT COUNT(*) AS count FROM student_quran_tasks WHERE student_id = ? AND teacher_completed = 1', [approvedStudent.id]);
    assert.equal(approved.count, 1, 'Teacher-approved recitation must survive prior-memorization deletion');
    await api(`/student-plans/${approvedStudent.id}`, manager.token, undefined, 'DELETE');
    await api(`/student-plans/${approvedStudent.id}`, manager.token,
      { ...planInput, ...removedRange, priorMemorization: [] }, 'PUT', 422);
    process.stdout.write('MySQL/API: deletion across both sources, partial deletion, new Al-Mumtahanah plan, unauthorized access and preserved teacher approvals passed.\n');
  }
} finally {
  await connection.end();
}
