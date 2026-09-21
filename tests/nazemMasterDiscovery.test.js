import test from 'node:test';
import assert from 'node:assert/strict';
import { NazemAdapter } from '../server/integrations/nazem/adapter.js';

test('master-only API plans are discovered without opening a nonexistent memorization tab', async () => {
  const fake = {
    listPlanGroups: async () => [{ externalId: '7', text: 'الحلقة', circleName: 'الحلقة' }],
    openFollowUp: async () => null,
    getPlanGroupDetails: async () => ({ id: 7, students: [{ student_id: 12, student_name: 'سليمان عبدالعزيز', items: [
      { type: 'master', daily_amount: 1, surah_from_name: 'البقرة', verse_from: 1, surah_to_name: 'البقرة', verse_to: 5 },
    ] }] }),
    readPlan: async () => { throw new Error('Unexpected UI fallback'); },
  };
  const result = await NazemAdapter.prototype.discoverStudentPlans.call(fake, []);
  assert.equal(result.plans.length, 1);
  assert.equal(result.plans[0].primary.tab, 'الإتقان');
  assert.equal(result.students[0].externalId, '12');
  assert.deepEqual(result.issues, []);
});

test('students absent from the picker are discovered through the HTML plan fallback too', async () => {
  const fake = {
    listPlanGroups: async () => [{ externalId: '7', text: 'الحلقة', circleName: 'الحلقة', studentCount: 1 }],
    openFollowUp: async () => null,
    getPlanGroupDetails: async () => { throw new Error('API unavailable'); },
    page: { goto: async () => {}, locator: () => ({ first: () => ({ waitFor: async () => {} }) }) },
    getPlanEditSaveButton: async () => {},
    getPlanStudentIdentities: async () => [{ externalId: '13', name: 'طالب جديد', normalizedName: 'طالب جديد' }],
    readPlan: async (_id, _student, tab) => tab === 'الحفظ' ? { tab, amount: 'وجه كامل' } : null,
  };
  const result = await NazemAdapter.prototype.discoverStudentPlans.call(fake, []);
  assert.equal(result.plans.length, 1);
  assert.equal(result.students[0].externalId, '13');
  assert.deepEqual(result.issues, []);
});
