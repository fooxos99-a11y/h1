import test from 'node:test';
import assert from 'node:assert/strict';
import { NazemAdapter } from '../server/integrations/nazem/adapter.js';
import { nazemSyncStatusLabel, nazemIssueMessage } from '../src/lib/nazemSyncIssues.js';

const student = { nazemStudentId: '17829', nazemStudentName: 'أحمد سليمان المقبل' };
const plan = { nazemPlanId: '87' };
const remoteStudent = { student_id: 17829, student_name: student.nazemStudentName, items: [] };

test('student in plan details but absent from follow-up is blocked without suggesting a relink or sending data', async () => {
  const adapter = new NazemAdapter();
  let freshReads = 0;
  adapter.openFollowUp = async (_id, _date, options) => {
    if (options.fresh) freshReads++;
    return { data: { students: [] } };
  };
  adapter.getPlanGroupDetails = async () => ({ students: [remoteStudent] });
  adapter.getPlanApi = async () => ({ data: { current_page: 1, last_page: 1, data: [{ id: 17829, status: 1 }] } });
  adapter.postFollowUpApi = async () => assert.fail('must not submit');
  await assert.rejects(adapter.submitAttendance(student, plan, { date: '2026-09-06', attendanceStatus: 2 }), {
    code: 'NAZEM_FOLLOW_UP_STUDENT_MISSING', syncStatus: 'blocked',
  });
  assert.equal(freshReads, 1);
  assert.match(nazemSyncStatusLabel('NAZEM_FOLLOW_UP_STUDENT_MISSING'), /متابعة ناظم/);
  assert.match(nazemIssueMessage({ errorCode: 'NAZEM_FOLLOW_UP_STUDENT_MISSING', operationType: 'attendance.submit' }), /الحضور محفوظ/);
});

test('stale follow-up is refreshed before declaring the student absent', async () => {
  const adapter = new NazemAdapter();
  adapter.openFollowUp = async (_id, _date, options) => ({ data: { students: options.fresh ? [remoteStudent] : [] } });
  adapter.getPlanGroupDetails = async () => assert.fail('fresh follow-up already identifies student');
  const result = await adapter.readStudentFollowUp(student, plan, '2026-09-06');
  assert.equal(result.data.students[0].student_id, 17829);
});

test('missing and ambiguous identifiers never fall back to a different student with the same name', async () => {
  const adapter = new NazemAdapter();
  adapter.openFollowUp = async () => ({ data: { students: [{ ...remoteStudent, student_id: 999 }] } });
  adapter.getPlanGroupDetails = async () => ({ students: [{ ...remoteStudent, student_id: 999 }] });
  await assert.rejects(adapter.readStudentFollowUp(student, plan, '2026-09-06'), { code: 'NAZEM_PLAN_STUDENT_MISMATCH' });
  adapter.openFollowUp = async () => ({ data: { students: [remoteStudent, remoteStudent] } });
  await assert.rejects(adapter.readStudentFollowUp(student, plan, '2026-09-06'), { code: 'NAZEM_PLAN_STUDENT_ID_AMBIGUOUS' });
});
