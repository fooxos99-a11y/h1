import test from 'node:test';
import assert from 'node:assert/strict';
import { hasRecitationEvidence, reconcileNazemReview } from '../server/integrations/nazem/reviewIdentity.js';
import { syncNazemScheduledTaskRange } from '../server/integrations/nazem/dailyTasks.js';
import { up, down } from '../server/migrations/2026.09.06.4-nazem-review-identity.js';
import { readFileSync } from 'node:fs';

const range = { fromSurah: 69, fromAyah: 9, toSurah: 69, toAyah: 35 };
const plan = { id: 1, studentId: 13, teacherId: 11 };
const task = (id, track = 'memorization') => ({ id, track, ...range, studentStatus: 'pending', teacherCompleted: null });
function fixture(initial) {
  const rows = structuredClone(initial);
  const writes = [];
  return { rows, writes, async query(sql, values) {
    if (sql.includes('FROM nazem_daily_follow_up_links')) return [[{ id: values[0] }]];
    if (sql.includes('FROM student_quran_tasks t')) {
      assert.match(sql, /FOR UPDATE/);
      assert.ok(!sql.includes('t.track=?'));
      return [structuredClone(rows)];
    }
    writes.push(sql);
    if (sql.startsWith('DELETE')) {
      for (let i = rows.length - 1; i >= 0; i--) if (values.includes(rows[i].id)) rows.splice(i, 1);
    } else if (sql.includes('SET nazem_review_id=NULL')) {
      rows.filter((item) => values.includes(item.id)).forEach((item) => { item.nazemReviewId = null; });
    } else if (sql.startsWith('UPDATE')) {
      const row = rows.find((item) => item.id === values[1]);
      row.nazemReviewId = values[0]; row.track = 'memorization';
    } else assert.fail(sql);
    return [{ affectedRows: 1 }];
  } };
}

test('Nazem review reconciles the exact duplicate across mastery and memorization and is repeatable', async () => {
  const db = fixture([task(373015, 'mastery'), task(373699)]);
  await reconcileNazemReview(db, plan, '2026-09-06', range, 1188170);
  assert.deepEqual(db.rows.map((row) => row.id), [373699]);
  assert.equal(db.rows[0].nazemReviewId, 1188170);
  const again = await reconcileNazemReview(db, plan, '2026-09-06', range, 1188170);
  assert.equal(again.changed, false);
  assert.equal(db.rows.length, 1);
});

test('a completed canonical review keeps its id and evaluation while an untouched duplicate is removed', async () => {
  const saved = { ...task(10), teacherCompleted: 1, hasAttempt: 1, score: 97 };
  const db = fixture([task(9, 'mastery'), saved]);
  await reconcileNazemReview(db, plan, '2026-09-06', range, 80);
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].id, 10);
  assert.equal(db.rows[0].score, 97);
});

test('recorded reviews are preserved while a changed Nazem review can be imported separately', async () => {
  for (const rows of [
    [{ ...task(1, 'mastery'), hasAttempt: 1 }, task(2)],
    [{ ...task(1), hasOfflinePart: 1, toAyah: 30 }, task(2)],
    [{ ...task(1), hasAyahMarks: 1 }, { ...task(2), hasNazemResult: 1 }],
    [{ ...task(1), nazemReviewId: 999 }],
    [{ ...task(1, 'mastery'), warningCount: 2 }, task(2)],
    [{ ...task(1), evaluationScore: 0 }, { ...task(2), hasOfflinePart: 1 }],
  ]) {
    const db = fixture(rows);
    const result = await reconcileNazemReview(db, plan, '2026-09-06', range, 80);
    rows.filter(hasRecitationEvidence).forEach((recorded) => {
      assert.ok(db.rows.some((row) => row.id === recorded.id));
    });
    assert.ok(result.keeper || result.preserveExisting);
  }
});

test('scheduled range import owns its transaction and rolls back failure without committing caller transactions', async () => {
  const calls = [];
  const db = {
    async beginTransaction() { calls.push('begin'); },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
    async query() { throw new Error('query failure'); },
  };
  const day = { taskType: 'review', surah_from: 69, verse_from: 9, surah_to: 69, verse_to: 35 };
  await assert.rejects(syncNazemScheduledTaskRange(db, { teacherId: 11 }, day), /query failure/);
  assert.deepEqual(calls, ['begin', 'rollback']);
  calls.length = 0;
  await assert.rejects(syncNazemScheduledTaskRange(db, { teacherId: 11 }, day, { inTransaction: true }), /query failure/);
  assert.deepEqual(calls, []);
});

test('review identity migration adds a unique nullable foreign key without rewriting existing recitations', async () => {
  const writes = []; let exists = false;
  const db = { async query(sql) {
    if (sql.includes('information_schema.columns')) return [[{ count: Number(exists) }]];
    writes.push(sql); exists = sql.includes('ADD COLUMN'); return [{}];
  } };
  await up(db); await up(db);
  assert.equal(writes.length, 1);
  assert.match(writes[0], /UNIQUE KEY student_quran_nazem_review_unique \(nazem_review_id\)/);
  assert.match(writes[0], /ON DELETE SET NULL/);
  assert.ok(!writes[0].includes('DELETE FROM'));
  await down(db); await down(db);
  assert.equal(writes.length, 2);
});

test('two imports share the locked plan and produce one canonical review, including a later refresh', async () => {
  const store = fixture([]);
  let lock = Promise.resolve();
  let sequence = 0;
  const connection = () => {
    let unlock;
    return {
      async beginTransaction() {},
      async commit() { unlock?.(); },
      async rollback() { unlock?.(); },
      async query(sql, params = []) {
        if (sql.includes('FROM student_quran_plans')) {
          assert.match(sql, /FOR UPDATE/);
          const previous = lock;
          lock = new Promise((resolve) => { unlock = resolve; });
          await previous;
          return [[{ ...plan, track: 'mastery' }]];
        }
        if (sql.includes('INSERT INTO nazem_daily_follow_up_links')) return [{ insertId: 80 }];
        if (sql.includes('FROM quran_ayah_pages')) return [[{ page: 567 }]];
        if (sql.includes('INSERT INTO student_quran_tasks')) {
          const identity = params[18];
          assert.equal(identity, 80);
          assert.ok(!store.rows.some((row) => row.nazemReviewId === identity));
          store.rows.push({ ...task(++sequence), nazemReviewId: identity });
          return [{ insertId: sequence }];
        }
        return store.query(sql, params);
      },
    };
  };
  const day = { id: 802474, date: '2026-09-06', taskType: 'review', remoteType: 'revision',
    surah_from: 69, verse_from: 9, surah_to: 69, verse_to: 35 };
  const link = { planId: 1, studentId: 13, teacherId: 11 };
  await Promise.all([syncNazemScheduledTaskRange(connection(), link, day), syncNazemScheduledTaskRange(connection(), link, day)]);
  await syncNazemScheduledTaskRange(connection(), link, day);
  assert.equal(store.rows.length, 1);
  assert.equal(sequence, 1);
  assert.equal(store.rows[0].track, 'memorization');
});

test('Nazem-enabled local task generation exits before creating its own review', () => {
  const source = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('async function ensureStudentPlanTasks('));
  assert.match(body, /if \(settings\.nazemIntegrationEnabled\) \{\s*await ensureNazemLinkTasks\(connection, plan, date\);\s*return \[\];/);
});
