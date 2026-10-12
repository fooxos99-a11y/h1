import test from 'node:test';
import assert from 'node:assert/strict';
import { NazemAdapter } from '../server/integrations/nazem/adapter.js';

test('an explicitly empty student menu closes and returns no students', async () => {
  const adapter = new NazemAdapter();
  let closed = false;
  const empty = {};
  const options = {
    filter() { return this; },
    or(marker) { assert.equal(marker, empty); return this; },
    first() { return this; },
    async waitFor() {},
    async count() { return 0; },
  };
  adapter.page = {
    getByRole: () => options,
    locator: () => ({ getByText: (text, config) => {
      assert.equal(text, 'لا يوجد');
      assert.equal(config.exact, true);
      return empty;
    } }),
    keyboard: { press: async key => { assert.equal(key, 'Escape'); closed = true; } },
  };
  assert.deepEqual(await adapter.readOpenOptions({ click: async () => {} }, { allowEmpty: true }), []);
  assert.equal(closed, true);
});

test('an unavailable menu still fails instead of being treated as an empty roster', async () => {
  const adapter = new NazemAdapter();
  const options = {
    filter() { return this; },
    or() { return this; },
    first() { return this; },
    async waitFor() { throw new Error('menu did not load'); },
  };
  adapter.page = { getByRole: () => options, locator: () => ({ getByText: () => ({}) }) };
  await assert.rejects(adapter.readOpenOptions({ click: async () => {} }, { allowEmpty: true }), /menu did not load/);
});

test('discovery continues after an empty circle and merges verified profile-only students', async () => {
  const adapter = new NazemAdapter();
  const organization = { id: '1', name: 'الجهة' };
  const circles = [{ id: '2', name: 'حلقة فارغة' }, { id: '3', name: 'سهيل بن عمرو' }];
  let currentCircle;
  let profileRead = false;
  adapter.openAddPlan = async () => {};
  adapter.page = {
    on() {}, off() {}, waitForTimeout: async () => {},
    getByRole: (_role, { name }) => ({ first: () => ({ name }) }),
  };
  adapter.selectOptionFromInput = async (input, row) => {
    if (input.name === 'اختر الحلقة') currentCircle = row;
  };
  adapter.readOpenOptions = async (input, options) => {
    if (input.name === 'اختر الجهة') return [organization];
    if (input.name === 'اختر الحلقة') return circles;
    assert.equal(options.allowEmpty, true);
    return currentCircle.id === '2' ? [] : [{ id: '301', name: 'طالب القائمة' }];
  };
  adapter.getStudentProfiles = async () => {
    profileRead = true;
    return [{ id: '302', name: 'راكان العوس', organizationName: organization.name, circleName: circles[1].name }];
  };
  const result = await adapter.getStudents();
  assert.equal(profileRead, true);
  assert.deepEqual(result.map(student => student.externalId), ['301', '302']);
  assert.equal(result[1].circle.name, 'سهيل بن عمرو');
});

test('discovery does not return picker data when the authoritative roster fails', async () => {
  const adapter = new NazemAdapter();
  adapter.openAddPlan = async () => {};
  adapter.page = { on() {}, off() {}, waitForTimeout: async () => {}, getByRole: () => ({ first: () => ({}) }) };
  adapter.readOpenOptions = async () => [];
  adapter.getStudentProfiles = async () => { throw new Error('incomplete roster'); };
  await assert.rejects(adapter.getStudents(), /incomplete roster/);
});
