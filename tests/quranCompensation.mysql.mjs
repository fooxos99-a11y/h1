import assert from 'node:assert/strict';
import process from 'node:process';
import mysql from 'mysql2/promise';

// Opt-in: an isolated API (tests/helpers/quranAuditApi.mjs) and its disposable quran_audit database.
const base = process.env.QURAN_TEST_API_URL;
const registration = process.env.QURAN_TEST_REGISTRATION;
assert.ok(base && registration && /^quran_audit(?:_[a-z0-9_]+)?$/.test(process.env.QURAN_TEST_MYSQL_DATABASE || ''), 'Explicit isolated Quran test configuration is required');
const db = await mysql.createConnection({ host: '127.0.0.1', port: Number(process.env.QURAN_TEST_MYSQL_PORT), user: process.env.QURAN_TEST_MYSQL_USER, password: process.env.QURAN_TEST_MYSQL_PASSWORD || '', database: process.env.QURAN_TEST_MYSQL_DATABASE });
async function api(path, token, body, method = body ? 'POST' : 'GET', expected = 200) {
  const r = await globalThis.fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Madarij-Native': '1', 'X-Registration-Number': registration, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (r.status !== expected) throw new Error(`${path} ${r.status} ${j.message}`);
  return j;
}
const login = (n) => api('/auth/login', null, { loginNumber: n, registrationNumber: registration });
const manager = await login(process.env.QURAN_TEST_MANAGER_LOGIN);
const settings = await api('/settings', manager.token);
await api('/settings', manager.token, { ...settings, weeklyHolidayDays: [], recitationSessionDays: [0,1,2,3,4,5,6], recitationAmountDay: 'same_day',
  quranTaskExecutionSource: 'teacher', memorizationExecutionSource: 'teacher', reviewExecutionSource: 'teacher', linkExecutionSource: 'teacher', repeatExecutionSource: 'teacher',
  recitationAttendanceSource: 'supervisor', nazemIntegrationEnabled: false, hideStudentAmounts: false, allowQuranCompensation: true, quranCompensationPointsPercent: 50, pointsSystemEnabled: true,
  memorizationRecitationMode: 'count', reviewRecitationMode: 'count', linkRecitationMode: 'count', teacherMemorizationRecitationMode: 'count', teacherReviewRecitationMode: 'count', teacherLinkRecitationMode: 'count' }, 'PUT');
const [c] = await db.query('INSERT INTO committees (name) VALUES (?)', [`تعويض ${Date.now()}`]);
const committeeId = c.insertId;
const tn = `T${Date.now()}`;
const [tr] = await db.query('INSERT INTO supervisors (name, login_number, national_id, phone, job_title, role) VALUES (?,?,?,?,?,?)', ['معلم', tn, tn, '', 'معلم', 'supervisor']);
await db.query('INSERT INTO supervisor_committees (supervisor_id, committee_id) VALUES (?, ?)', [tr.insertId, committeeId]);
const teacher = await login(tn);
const number = `C${Date.now()}`;
const [s] = await db.query('INSERT INTO students (name, login_number, national_id, guardian_phone, committee_id) VALUES (?,?,?,?,?)', ['طالب تعويض', number, number, '', committeeId]);
const studentId = s.insertId;
await api(`/student-plans/${studentId}`, manager.token, {
  startPage: 50, endPage: 304, startSurah: 3, startAyah: 1, endSurah: 18, endAyah: 110,
  dailyPages: 1, linkPages: 5, reviewPages: 5, priorMemorization: [{ startPage: 1, endPage: 49 }],
}, 'PUT');
const today = (await api(`/students/${studentId}/quran-today`, manager.token)).date;
const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
// Plan started two days ago; the student was absent both days.
await db.query("UPDATE student_quran_plans SET start_date = ?, schedule_days_json = '[0,1,2,3,4,5,6]' WHERE student_id = ? AND status = 'active'", [addDays(today, -2), studentId]);
const [[p]] = await db.query("SELECT id FROM student_quran_plans WHERE student_id = ? AND status = 'active'", [studentId]);
for (const d of [addDays(today, -2), addDays(today, -1)]) {
  await db.query("INSERT INTO student_quran_tasks (plan_id, student_id, task_date, task_type, track, from_page, to_page, from_surah, from_ayah, to_surah, to_ayah, target_pages, student_status) VALUES (?, ?, ?, 'link', 'memorization', 45, 49, 2, 211, 2, 286, 5, 'not_done')", [p.id, studentId, d]);
  await db.query("INSERT INTO student_quran_tasks (plan_id, student_id, task_date, task_type, track, from_page, to_page, from_surah, from_ayah, to_surah, to_ayah, target_pages, student_status) VALUES (?, ?, ?, 'review', 'memorization', 1, 5, 1, 1, 2, 37, 5, 'not_done')", [p.id, studentId, d]);
}
await db.query("DELETE FROM student_quran_tasks WHERE plan_id = ? AND task_date = ?", [p.id, today]);
const todayTasks = await api(`/students/${studentId}/quran-today`, manager.token);
await db.query("INSERT IGNORE INTO attendance_records (student_id, record_date, status) VALUES (?, ?, 'present')", [studentId, today]);
const comp = () => api(`/supervisors/${teacher.id}/quran-compensations?studentId=${studentId}&date=${today}`, teacher.token);
const before = await comp();
assert.equal(before.memorization.items.length, 2, 'two absent days owe two memorization amounts');
assert.ok(before.memorization.blocked, 'memorization compensation waits for the day');
assert.equal(before.link.owed, 2);
assert.equal(before.review.owed, 2, 'two missed review days');
const todayReview = todayTasks.tasks.find((t) => t.taskType === 'review');
assert.equal(todayReview.toPage - todayReview.fromPage + 1, 5, 'today\'s review keeps its own amount');
// Memorization compensation must wait for today's own recitation.
await api(`/supervisors/${teacher.id}/quran-compensations`, teacher.token, { studentId, taskType: 'memorization', date: today }, 'POST', 409);
const session = async () => (await api(`/supervisors/${teacher.id}/quran-evaluation?date=${today}`, teacher.token)).tasks.filter((t) => t.studentId === studentId);
const evaluate = async (task, mistakeCount = 0) => api(`/supervisors/${teacher.id}/quran-evaluation/${task.id}`, teacher.token, { date: today, mistakeCount, warningCount: 1, requestId: `r${task.id}-${Date.now()}` });
for (const t of (await session()).filter((t) => t.taskType === 'memorization')) await evaluate(t);
for (const t of (await session()).filter((t) => t.taskType === 'link')) await evaluate(t);
const created = await api(`/supervisors/${teacher.id}/quran-compensations`, teacher.token, { studentId, taskType: 'memorization', date: today });
const again = await api(`/supervisors/${teacher.id}/quran-compensations`, teacher.token, { studentId, taskType: 'memorization', date: today });
assert.deepEqual(again.taskIds, created.taskIds, 'a pending compensation is reopened, not duplicated');
const sessionRows = await session();
assert.ok(sessionRows.some((t) => created.taskIds.includes(t.id) && t.compensationIndex === 1), 'the compensation appears in the session');
for (const t of sessionRows.filter((t) => created.taskIds.includes(t.id))) await evaluate(t);
const afterMemorization = await comp();
assert.equal(afterMemorization.memorization.done, 1);
assert.equal(afterMemorization.memorization.items.length, 1);
const linkComp = await api(`/supervisors/${teacher.id}/quran-compensations`, teacher.token, { studentId, taskType: 'link', date: today });
for (const t of (await session()).filter((t) => linkComp.taskIds.includes(t.id))) await evaluate(t, 2);
const afterLink = await comp();
assert.equal(afterLink.link.done, 1);
assert.equal(afterLink.link.owed, 1);
for (const t of (await session()).filter((t) => t.taskType === 'review')) await evaluate(t);
const reviewComp = await api(`/supervisors/${teacher.id}/quran-compensations`, teacher.token, { studentId, taskType: 'review', date: today });
const reviewRows = (await session()).filter((t) => reviewComp.taskIds.includes(t.id));
assert.equal(reviewRows[0].fromPage, todayReview.toPage + 1, 'the review compensation continues the cycle');
assert.equal(reviewRows.at(-1).toPage - reviewRows[0].fromPage + 1, 5, 'one day\'s review amount');
for (const t of reviewRows) await evaluate(t);
const afterReview = await comp();
assert.equal(afterReview.review.owed, 1);
assert.equal(afterReview.review.done, 1);
const [points] = await db.query('SELECT points, reason, dedupe_key FROM student_point_transactions WHERE student_id = ? ORDER BY id', [studentId]);
assert.ok(points.some((row) => row.dedupe_key.endsWith(':memorization:compensation:1') && Number(row.points) === 49), 'memorization compensation earns the compensation percent');
assert.ok(points.some((row) => row.dedupe_key.endsWith(':link:compensation:1') && Number(row.points) === 45));
assert.ok(points.some((row) => row.dedupe_key.endsWith(':memorization') && Number(row.points) === 98), 'the regular day keeps its own points');
const [[pl]] = await db.query('SELECT next_memorization_page, next_memorization_surah, next_memorization_ayah FROM student_quran_plans WHERE id = ?', [p.id]);
assert.deepEqual([pl.next_memorization_surah, pl.next_memorization_ayah], [3, 16], 'the plan continues after the compensated amount');
await db.end();
globalThis.console.log('Quran compensation integration checks passed');
