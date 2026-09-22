import test from 'node:test';
import assert from 'node:assert/strict';
import { nazemLateOptions, selectNazemLatePrefix } from '../shared/nazem-late-selection.js';
import { validateNazemLateSession } from '../server/services/nazemLateSelection.js';
import { NazemAdapter } from '../server/integrations/nazem/adapter.js';
import { selectNazemFirstActionableTasks } from '../server/integrations/nazem/taskSelection.js';
import { mapRuwasiRecitationToNazem } from '../server/integrations/nazem/mapping.js';

const tasks = [[1, 4], [5, 6], [7, 13], [3, 6], [7, 9]].map(([fromAyah, toAyah], index) => ({
  id: index + 1, studentId: 99, planId: 87, taskType: 'memorization', track: 'memorization',
  taskDate: `2026-09-${[13, 14, 15, 17, 20][index]}`, nazemLate: 1, nazemManaged: 1,
  fromSurah: index < 3 ? 61 : 62, toSurah: index < 3 ? 61 : 62, fromAyah, toAyah,
  toSurahAyahCount: index < 3 ? 14 : 11, toPage: 551,
}));

test('late selection exposes only whole-day endpoints and stops at the pending-day gap', () => {
  const options = nazemLateOptions(tasks[0], [...tasks].reverse());
  assert.deepEqual(options.map(item => item.ayah), [4, 6, 13]);
  assert.deepEqual(selectNazemLatePrefix(options, { surah: 61, ayah: 6 }).map(item => item.id), [1, 2]);
  assert.deepEqual(selectNazemLatePrefix(options, { surah: 61, ayah: 13 }).map(item => item.id), [1, 2, 3]);
  assert.deepEqual(selectNazemLatePrefix(options).map(item => item.id), [1]);
  assert.deepEqual(nazemLateOptions(tasks[3], tasks.slice(3)).map(item => item.ayah), [6, 9]);
  assert.deepEqual(nazemLateOptions(tasks[1], tasks), []);
});

test('a new surah is allowed only after its predecessor ends, and tracks stay separate', () => {
  const next = { ...tasks[1], fromSurah: 62, toSurah: 62, fromAyah: 1, toAyah: 2 };
  assert.equal(nazemLateOptions(tasks[0], [tasks[0], next]).length, 1);
  const end = { ...tasks[0], toAyah: 14 };
  assert.equal(nazemLateOptions(end, [end, next]).length, 2);
  assert.equal(nazemLateOptions(tasks[0], [tasks[0], { ...tasks[1], track: 'mastery' }]).length, 1);
});

test('server accepts only an ordered prefix of whole late days, including replay', async () => {
  const mock = rows => ({ query: async (sql, params) => [sql.includes('WHERE t.id IN')
    ? rows.filter(row => params.slice(0, -1).includes(row.id))
    : rows.map(row => ({ ...row, availableOn: '2026-09-22', remoteStatus: 'pending' }))] });
  const connection = mock(tasks);
  const session = ids => ({ studentId: 99, sessionDate: '2026-09-22', sessionId: 'test', tasks: ids.map(taskId => ({taskId})) });
  assert.equal(await validateNazemLateSession(connection, session([1, 2, 3]), 1), true);
  for (const ids of [[2], [1, 3], [2, 1], [1, 2, 3, 4], [1, 1], [1, 999]]) {
    assert.equal(await validateNazemLateSession(connection, session(ids), 1), false);
  }
  assert.equal(await validateNazemLateSession(mock(tasks.map(row => ({ ...row, sameSession: 1 }))), session([1, 2]), 1), true);
});

test('import and selection preserve the oldest late identity instead of substituting today', async () => {
  const adapter = new NazemAdapter();
  const day = { id: 100, date: '2026-09-16', status: 'pending', surah_from: 61, verse_from: 14, surah_to: 62, verse_to: 2 };
  adapter.openFollowUp = async () => ({data: {students: [{student_id: 99, items: [{type: 'conserve', is_active: true,
    pending_day: day, today: null, late_items: tasks.map(task => ({id: task.id, source_date: task.taskDate,
      status: 'pending', surah_from: task.fromSurah, verse_from: task.fromAyah, surah_to: task.toSurah, verse_to: task.toAyah}))}]}]}});
  const result = await adapter.readStudentFollowUpHistory('87', {nazemStudentId: '99'}, 1);
  assert.ok(result.scheduledFollowUps.every(day => day.nazemActionableDate === '2026-09-13'));
  const authorities = result.scheduledFollowUps.map(day => ({...tasks[0], taskDate: day.nazemActionableDate}));
  assert.deepEqual(selectNazemFirstActionableTasks(tasks, authorities).map(item => item.id), [1]);
});

test('changed review endpoint is posted to its original remote day and independently verified', async () => {
  const adapter = new NazemAdapter();
  const day = { id: 80, date: '2026-09-22', status: 'pending', surah_from: 61, verse_from: 1, surah_to: 61, verse_to: 14 };
  const mapped = mapRuwasiRecitationToNazem({ taskType: 'review', taskDate: day.date, sessionDate: day.date,
    attendanceStatus: 'present', teacherCompleted: 1, fromSurah: 61, fromAyah: 1,
    toSurah: 61, toAyah: 14, actualToSurah: 61, actualToAyah: 6, mistakeCount: 2 });
  adapter.resolveRecitationFollowUp = async () => ({item: {type: 'revision'}, student: {attendance_status: 2}, day,
    payload: {data: {students: [{student_id: 99, attendance_status: 2, items: [{type: 'revision', today: day}]}]}}});
  let writes = 0;
  adapter.postRecitationApi = async (path, body) => {
    writes++;
    assert.equal(path, '/educational-plans/item-days/80/partial');
    assert.equal(body.actual_end_surah, 61);
    assert.equal(body.actual_end_aya, 6);
    Object.assign(day, {status: 'partial', actual_surah_to: 61, actual_verse_to: 6, mistake: 2, tune: 0});
  };
  const result = await adapter.submitRecitation({nazemStudentId: '99'}, {nazemPlanId: '87'}, mapped);
  assert.equal(result.actualAyah, 6);
  assert.equal(day.verse_to, 14);
  assert.equal(writes, 1);
  await adapter.submitRecitation({nazemStudentId: '99'}, {nazemPlanId: '87'}, mapped);
  assert.equal(writes, 1);
});

test('a later late record cannot be sent while an earlier one remains unconfirmed', async () => {
  const adapter = new NazemAdapter();
  const late = [{id: 1, date: '2026-09-13', status: 'pending'}, {id: 2, date: '2026-09-14', status: 'pending'}];
  adapter.resolveRecitationFollowUp = async () => ({item: {late_items: late}, late: late[1]});
  adapter.datedLateItems = async () => late;
  adapter.postRecitationApi = async () => assert.fail('must not send out of order');
  await assert.rejects(adapter.submitRecitation({}, {}, {taskType: 'memorization', remoteType: 'conserve', completed: true}),
    {code: 'NAZEM_PREVIOUS_DAYS_BLOCKING'});
});
