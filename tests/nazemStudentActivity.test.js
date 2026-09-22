import test from 'node:test';
import assert from 'node:assert/strict';
import { readNazemStudentActivity } from '../server/integrations/nazem/studentActivity.js';
import { NazemAdapter } from '../server/integrations/nazem/adapter.js';
import { nazemRetryLabel } from '../src/lib/nazemSyncIssues.js';

test('inactive students beyond the first page are identified by id without name fallback', async () => {
  const calls = [];
  const result = await readNazemStudentActivity(async path => {
    calls.push(path);
    const page = calls.length;
    return { data: { current_page: page, last_page: 2, data: [{ id: page === 1 ? 99 : 22165, status: page === 1 ? 1 : 0 }] } };
  }, 22165);
  assert.equal(result, 'inactive');
  assert.deepEqual(calls, ['/api/students?page=1', '/api/students?page=2']);
});
test('unknown status and incomplete profile pagination are never treated as inactive', async () => {
  assert.equal(await readNazemStudentActivity(async () => ({ data: { current_page: 1, last_page: 1, data: [{ id: 1, status: null }] } }), 1), 'unknown');
  await assert.rejects(readNazemStudentActivity(async () => ({ data: { data: [] } }), 1), { code: 'NAZEM_STUDENT_PROFILES_FAILED' });
});
test('inactive student attendance remains saved locally and never writes or offers blind retry', async () => {
  const adapter = new NazemAdapter();
  adapter.openFollowUp = async () => ({ data: { students: [] } });
  adapter.getPlanGroupDetails = async () => ({ students: [{ student_id: 22165 }] });
  adapter.getPlanApi = async () => ({ data: { current_page: 1, last_page: 1, data: [{ id: 22165, status: 0 }] } });
  adapter.postFollowUpApi = async () => assert.fail('inactive attendance cannot be submitted');
  await assert.rejects(adapter.submitAttendance({ nazemStudentId: '22165' }, { nazemPlanId: '268' }, { date: '2026-09-22', attendanceStatus: 2 }), { code: 'NAZEM_STUDENT_INACTIVE' });
  assert.equal(nazemRetryLabel({ errorCode: 'NAZEM_STUDENT_INACTIVE' }), 'إعادة التحقق من الحالة');
});
