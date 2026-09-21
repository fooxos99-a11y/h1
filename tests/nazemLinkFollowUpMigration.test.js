import test from 'node:test';
import assert from 'node:assert/strict';
import { up, down } from '../server/migrations/2026.09.06.2-nazem-link-follow-up-type.js';
import { loadDatabaseMigrations } from '../server/databaseMigrations.js';

const database = (initial = "task_type in ('memorization','review')", records = []) => {
  let clause = initial;
  const alterations = [];
  return { alterations, records,
    insert(type) {
      if (clause && !clause.includes(`'${type}'`)) throw new Error("Check constraint 'nazem_daily_follow_up_type_check' is violated.");
      records.push(type);
    },
    async query(sql) {
      if (sql.includes('information_schema.check_constraints')) return [clause ? [{ clause }] : []];
      if (sql.startsWith('SELECT COUNT(*)')) return [[{ count: records.filter((type) => !['memorization', 'review'].includes(type)).length }]];
      if (sql.startsWith('ALTER TABLE')) {
        assert.match(sql, /ADD CONSTRAINT nazem_daily_follow_up_type_check/);
        if (clause) assert.match(sql, /DROP CHECK nazem_daily_follow_up_type_check,/);
        clause = sql.slice(sql.indexOf('CHECK (task_type'));
        alterations.push(sql);
        return [{}];
      }
      throw new Error('Unexpected migration query');
    },
  };
};

test('link follow-up migration admits the independent link type while preserving other types and rows', async () => {
  const db = database(undefined, ['memorization', 'review']);
  assert.throws(() => db.insert('link'), /nazem_daily_follow_up_type_check/);
  await up(db);
  for (const type of ['memorization', 'review', 'link']) db.insert(type);
  assert.throws(() => db.insert('unknown'), /nazem_daily_follow_up_type_check/);
  assert.deepEqual(db.records, ['memorization', 'review', 'memorization', 'review', 'link']);
  assert.equal(db.alterations.length, 1);
  await up(db);
  assert.equal(db.alterations.length, 1);
});

test('migration restores a missing constraint without a failing DROP CHECK', async () => {
  const db = database(null);
  await up(db);
  assert.doesNotMatch(db.alterations[0], /DROP CHECK/);
  db.insert('link');
  assert.throws(() => db.insert('unknown'), /nazem_daily_follow_up_type_check/);
});

test('migration recognizes MySQL escaped check clauses after a successful application', async () => {
  const db = database("(`task_type` in (_utf8mb4\\'memorization\\',_utf8mb4\\'review\\',_utf8mb4\\'link\\'))");
  await up(db);
  assert.equal(db.alterations.length, 0);
});

test('rollback refuses to discard saved link follow-ups', async () => {
  const db = database("task_type in ('memorization','review','link')", ['link']);
  await assert.rejects(down(db), /preserve recitation data/);
  assert.equal(db.alterations.length, 0);
  assert.deepEqual(db.records, ['link']);
});

test('rollback restores the original constraint when no link records exist', async () => {
  const db = database("task_type in ('memorization','review','link')", ['review']);
  await down(db);
  assert.throws(() => db.insert('link'), /nazem_daily_follow_up_type_check/);
  db.insert('memorization');
});

test('link follow-up migration runs after independent tracks on new and existing databases', async () => {
  const migrations = await loadDatabaseMigrations();
  const index = migrations.findIndex((migration) => migration.version === '2026.09.06.2');
  assert.ok(index > migrations.findIndex((migration) => migration.version === '2026.09.06.1'));
  assert.equal(migrations[index].up, up);
});
