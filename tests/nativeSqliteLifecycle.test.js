import assert from 'node:assert/strict';
import test from 'node:test';
import { createEncryptedSqliteDatabaseOpener } from '../src/lib/nativeSqliteDatabase.js';

function fixture({ orphan = false, failOpen = false, failSecret = false } = {}) {
  const disk = { sessions: ['retained-session'], secret: 'existing-key' };
  const connections = new Map(orphan ? [['recitation', {}], ['unrelated', {}]] : [['unrelated', {}]]);
  const managed = new Map();
  const counts = { create: 0, close: 0, secret: 0, open: 0, schema: 0 };
  const native = { async closeConnection({ database }) { counts.close++; connections.delete(database); } };
  const sqlite = {
    async isSecretStored() { if (failSecret) { failSecret = false; throw new Error('secret read unavailable'); } return { result: true }; },
    async setEncryptionSecret() { counts.secret++; },
    async isConnection(name) { return { result: managed.has(name) }; },
    async retrieveConnection(name) { return managed.get(name); },
    async closeConnection(name) { managed.delete(name); await native.closeConnection({ database: name }); },
    async createConnection(name) {
      counts.create++;
      if (connections.has(name)) throw new Error(`CreateConnection: Connection ${name} already exists`);
      let opened = false;
      const connection = {
        async isDBOpen() { return { result: opened }; },
        async open() { counts.open++; if (failOpen) { failOpen = false; throw new Error('open interrupted'); } opened = true; },
      };
      connections.set(name, connection); managed.set(name, connection);
      return connection;
    },
  };
  return { open: createEncryptedSqliteDatabaseOpener({ sqlite, native, createSecret: () => 'never-replace' }),
    disk, connections, counts, initialize: async () => { counts.schema++; } };
}

test('parallel native initialization has one owner, one schema upgrade and one connection', async () => {
  const env = fixture();
  const results = await Promise.all(Array.from({ length: 30 }, () => env.open('recitation', 1, env.initialize)));
  assert.ok(results.every(value => value === results[0]));
  assert.deepEqual(env.counts, { create: 1, close: 0, secret: 0, open: 1, schema: 1 });
});

test('a surviving native connection after WebView reload is recovered without deleting stored sessions or unrelated connections', async () => {
  const env = fixture({ orphan: true });
  await env.open('recitation', 1, env.initialize);
  assert.equal(env.counts.create, 2);
  assert.equal(env.counts.close, 1);
  assert.ok(env.connections.has('unrelated'));
  assert.deepEqual(env.disk.sessions, ['retained-session']);
});

for (const stage of ['open', 'schema']) test(`a failed native ${stage} releases only its connection and permits retry`, async () => {
  const env = fixture({ failOpen: stage === 'open' });
  await assert.rejects(env.open('recitation', 1, async () => { if (stage === 'schema') throw new Error('schema interrupted'); }), /interrupted/);
  await env.open('recitation', 1, env.initialize);
  assert.equal(env.counts.close, 1);
  assert.equal(env.counts.create, 2);
  assert.ok(env.connections.has('unrelated'));
  assert.deepEqual(env.disk.sessions, ['retained-session']);
});

test('a secret read failure never generates a replacement encryption key', async () => {
  const env = fixture({ failSecret: true });
  await assert.rejects(env.open('recitation', 1, env.initialize), /secret read/);
  assert.equal(env.counts.secret, 0);
  await env.open('recitation', 1, env.initialize);
  assert.equal(env.disk.secret, 'existing-key');
});
