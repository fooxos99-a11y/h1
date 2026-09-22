import test from 'node:test';
import assert from 'node:assert/strict';
import { NazemAdapter } from '../server/integrations/nazem/adapter.js';
import { getBusinessDate, shiftDateOnly } from '../shared/business-date.js';

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
