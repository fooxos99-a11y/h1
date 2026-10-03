import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import { offlineRecitationStore } from '../src/services/offlineRecitationStore.js';
import { serializedSqliteConnection } from '../src/lib/serializedSqliteConnection.js';

async function fixture(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const source = await readFile(new URL('../src/services/offlineRecitationStore.js', import.meta.url), 'utf8');
  db.exec(source.match(/await connection\.execute\(`([\s\S]*?)`\);/)[1]);
  let active = false;
  const native = {
    async executeSet(set, transaction = true) {
      assert.equal(active, false, 'native transactions must never overlap');
      assert.equal(transaction, true);
      active = true;
      db.exec('BEGIN');
      try {
        for (const { statement, values } of set) {
          await setImmediate();
          db.prepare(statement).run(...values);
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      } finally {
        active = false;
      }
    },
    run(statement, values) { return this.executeSet([{ statement, values }]); },
    async query(statement, values) {
      assert.equal(active, false, 'reads must not observe an unfinished transaction');
      return { values: db.prepare(statement).all(...values) };
    },
  };
  const store = new offlineRecitationStore.constructor();
  store.driver = 'sqlite';
  store.connection = serializedSqliteConnection(native);
  return { db, store };
}

const session = (studentId) => ({ sessionId: randomUUID(), studentId, sessionDate: '2026-09-29', tasks: [{ taskId: studentId }] });

test('SQLite serializes concurrent session, draft, cache and metadata operations', async (t) => {
  const { store } = await fixture(t);
  const values = Array.from({ length: 20 }, (_, index) => session(index + 1));
  await Promise.all(values.map(value => store.saveDraft('teacher', value.studentId, value)));
  await Promise.all([
    ...values.map(value => store.commitSession('teacher', value)),
    store.setMeta('last_sync:teacher', 'saved'),
    store.cacheSnapshot('teacher', { students: [] }),
    store.saveDraft('other', 1, { retained: true }),
  ]);
  assert.equal((await store.getSessions('teacher')).length, 20);
  for (const value of values) assert.equal(await store.getDraft('teacher', value.studentId), null);
  assert.deepEqual(await store.getDraft('other', 1), { retained: true });
  assert.equal(await store.getMeta('last_sync:teacher'), 'saved');
  await Promise.all(values.map(value => store.updateSession('teacher', value.sessionId, { status: 'synced' })));
  assert.equal((await store.getSessions('teacher', ['synced'])).length, 20);
});

test('failed SQLite session rolls back, preserves draft and permits queued work and retry', async (t) => {
  const { store, db } = await fixture(t);
  const value = session(1);
  await store.saveDraft('teacher', 1, value);
  db.exec("CREATE TRIGGER fail_delete BEFORE DELETE ON offline_drafts BEGIN SELECT RAISE(ABORT, 'fixture failure'); END");
  await assert.rejects(store.commitSession('teacher', value), /fixture failure/);
  assert.equal((await store.getSessions('teacher')).length, 0);
  assert.deepEqual(await store.getDraft('teacher', 1), value);
  await store.setMeta('after_failure', true);
  assert.equal(await store.getMeta('after_failure'), true);
  db.exec('DROP TRIGGER fail_delete');
  await store.commitSession('teacher', value);
  assert.equal((await store.getSessions('teacher')).length, 1);
  assert.equal(await store.getDraft('teacher', 1), null);
});
