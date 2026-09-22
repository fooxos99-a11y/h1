import test from 'node:test';
import assert from 'node:assert/strict';
import { importableNazemPlans, needsNazemStudentImport, selectedNazemPlanCandidateIds } from '../shared/nazem-import-selection.js';
import { mergeNazemStudentSources, NazemAdapter } from '../server/integrations/nazem/adapter.js';

test('students without plans remain importable, existing students are not duplicated', () => {
  assert.equal(needsNazemStudentImport({ plans: [] }), true);
  assert.equal(needsNazemStudentImport({ linkedStudentId: 1, plans: [] }), false);
  const candidate = { linkedStudentId: 1, plans: [{ id: 2, status: 'discovered' }, { id: 3, status: 'imported' }] };
  assert.equal(needsNazemStudentImport(candidate), true);
  assert.deepEqual(importableNazemPlans(candidate).map((plan) => plan.id), [2]);
  const selections = [{ candidateId: 1, importPlan: false }, { candidateId: 2, importPlan: true }];
  assert.deepEqual(selectedNazemPlanCandidateIds('selected', selections), [2]);
  assert.deepEqual(selectedNazemPlanCandidateIds('with_plans', selections), [1, 2]);
});

test('roster IDs resolve missing dropdown IDs within the same circle without choosing a duplicate name', () => {
  const organization = { name: 'الجهة' };
  const circle = { name: 'الحلقة الأولى' };
  const profiles = [
    { id: '101', name: 'عمر أحمد', organizationName: organization.name, circleName: circle.name },
    { id: '102', name: 'عمر أحمد', organizationName: organization.name, circleName: circle.name },
    { id: '103', name: 'عمر الرمخاني', organizationName: organization.name, circleName: circle.name },
    { id: '104', name: 'عمر الرمخاني', organizationName: organization.name, circleName: 'حلقة أخرى' },
  ];
  const merged = mergeNazemStudentSources([
    { name: 'عمر أحمد', organization, circle },
    { name: 'عمر الرمخاني', organization, circle },
  ], profiles, [{ organization, circle }]);
  assert.deepEqual(merged.map((student) => student.externalId).sort(), ['101', '102', '103']);
  assert.equal(merged.length, 3);
});

const rosterAdapter = (pages) => {
  const adapter = new NazemAdapter();
  let index = 0;
  adapter.page = {
    waitForResponse: async () => ({ json: async () => ({ data: pages[index++] }) }),
    goto: async () => {},
    getByRole: () => ({ click: async () => {} }),
  };
  return adapter;
};
const page = (current, ids, extra = {}) => ({
  current_page: current, last_page: 2, total: 2, next_page_url: current === 1 ? '?page=2' : null,
  data: ids.map((id) => ({ id, name: `طالب ${id}` })), ...extra,
});

test('student discovery reads every roster page and rejects duplicated or incomplete pagination', async () => {
  const students = await rosterAdapter([page(1, [1]), page(2, [2])]).getStudentProfiles();
  assert.deepEqual(students.map((student) => student.id), ['1', '2']);
  for (const pages of [
    [page(1, [1]), page(1, [1])],
    [page(1, [1]), page(2, [1])],
    [page(1, [1], { next_page_url: null })],
    [page(1, [1]), page(2, [], { total: 2 })],
  ]) {
    await assert.rejects(rosterAdapter(pages).getStudentProfiles(), { code: 'NAZEM_STUDENT_PROFILES_FAILED' });
  }
});
