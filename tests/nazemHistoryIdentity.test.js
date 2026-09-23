import test from 'node:test';
import assert from 'node:assert/strict';
import { NazemAdapter } from '../server/integrations/nazem/adapter.js';
import { getBusinessDate, shiftDateOnly } from '../shared/business-date.js';

test('review history does not create backlog or make missed review the next actionable day', async () => {
  const adapter = new NazemAdapter();
  const today = getBusinessDate();
  const previous = shiftDateOnly(today, -1);
  const range = { status: 'pending', surah_from: 67, verse_from: 1, surah_to: 114, verse_to: 6 };
  adapter.openFollowUp = async (_plan, date) => ({ data: { students: [{ student_id: 1, attendance_status: 2,
    items: [{ id: 32698, type: 'revision', is_active: true,
      today: { ...range, id: date === today ? 200 : 100, date },
      pending_day: { ...range, id: 99, date: previous },
      late_items: [{ ...range, id: 98, date: previous }] }] }] } });
  adapter.datedLateItems = async (_item, _plan, _student, type) => {
    assert.notEqual(type, 'revision', 'Review must not use late-record lookup');
    return [];
  };
  const history = await adapter.readStudentFollowUpHistory('87', { nazemStudentId: '1' }, 2);
  assert.equal(history.scheduledFollowUps.length, 2);
  assert.ok(history.scheduledFollowUps.every(day => !day.nazemLate && !day.nazemPendingDay));
  assert.ok(history.scheduledFollowUps.every(day => day.nazemActionableDate === today));
});

test('history reads leave the current pending identity fresh after Nazem regenerates it on historical navigation', async () => {
  const adapter = new NazemAdapter();
  const today = getBusinessDate();
  let currentId = 100;
  const reads = [];
  adapter.openFollowUp = async (_plan, date, options) => {
    reads.push({ date, fresh: options.fresh });
    if (date !== today) currentId++;
    return { data: { students: [{ student_id: 1, attendance_status: 2, items: [{ id: 32698, type: 'revision', is_active: true, late_items: [],
      today: { id: date === today ? currentId : 90, date, status: 'pending', surah_from: 67, verse_from: 1, surah_to: 114, verse_to: 6 } }] }] } };
  };
  const result = await adapter.readStudentFollowUpHistory('87', { nazemStudentId: '1' }, 3, { freshCurrent: false });
  assert.deepEqual(reads.map(read => read.date), [shiftDateOnly(today, -2), shiftDateOnly(today, -1), today]);
  assert.equal(reads.at(-1).fresh, true);
  const current = result.scheduledFollowUps.find(day => day.date === today);
  assert.equal(current.id, currentId);
  assert.equal(current.nazemItemId, '32698');
  assert.equal(current.nazemActionableDate, today);
});
