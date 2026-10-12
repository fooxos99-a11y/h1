import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { latestRecitationJobSql } from '../server/integrations/nazem/recitationQueueRecovery.js';

const source = readFileSync(new URL('../server/integrations/nazem/queue.js', import.meta.url), 'utf8');
const definition = source.slice(source.indexOf('export async function claimNextNazemJob'),
  source.indexOf('export async function updateNazemJobProgress')).replace('export ', '');
const claim = new Function('latestRecitationJobSql', 'CLAIMABLE_STATUSES', 'WORKER_ID',
  `${definition}; return claimNextNazemJob;`)(latestRecitationJobSql, ['pending', 'retrying'], 'test-worker');

function connection({ acquired = 1, active = false, updateError = null, lockedJob = true } = {}) {
  const calls = [];
  return {
    calls,
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    query: async (sql) => {
      if (sql.startsWith('SET TRANSACTION')) {
        assert.match(sql, /READ COMMITTED/);
        calls.push('isolation');
        return [{}];
      }
      if (sql.includes('sync_uuid AS syncUuid')) {
        const locked = sql.includes('FOR UPDATE');
        calls.push(locked ? 'row' : 'candidate');
        if (sql.includes('NOT IN') || (locked && !lockedJob)) return [[]];
        if (locked) assert.match(sql, /WHERE job.id = \?/);
        return [[{ id: 1, teacherId: 11, payload: '{}', attemptCount: 0, maxAttempts: 2 }]];
      }
      if (sql.includes('GET_LOCK')) { calls.push('lock'); return [[{ acquired, lockName: 'teacher-11' }]]; }
      if (sql.includes('RELEASE_LOCK')) { calls.push('release'); return [[{ released: 1 }]]; }
      if (sql.includes('SELECT id FROM nazem_sync_jobs')) {
        assert.doesNotMatch(sql, /FOR UPDATE/);
        calls.push('recheck');
        return [active ? [{ id: 2 }] : []];
      }
      if (sql.includes('UPDATE nazem_sync_jobs')) {
        calls.push('claim');
        if (updateError) throw updateError;
        return [{ affectedRows: 1 }];
      }
      throw new Error('Unexpected query');
    },
  };
}

test('a competing teacher claim never consumes another job attempt', async () => {
  const busy = connection({ acquired: 0 });
  assert.equal(await claim(busy), null);
  assert.deepEqual(busy.calls, ['isolation', 'begin', 'candidate', 'lock', 'rollback', 'isolation', 'begin', 'candidate', 'commit']);
  const active = connection({ active: true });
  assert.equal(await claim(active), null);
  assert.deepEqual(active.calls, ['isolation', 'begin', 'candidate', 'lock', 'row', 'recheck', 'rollback', 'release',
    'isolation', 'begin', 'candidate', 'commit']);
});

test('teacher claim releases its mutex after commit and rollback', async () => {
  const ready = connection();
  assert.equal((await claim(ready)).attemptCount, 1);
  assert.deepEqual(ready.calls, ['isolation', 'begin', 'candidate', 'lock', 'row', 'recheck', 'claim', 'commit', 'release']);
  const failed = connection({ updateError: new Error('injected database failure') });
  await assert.rejects(claim(failed), /injected database failure/);
  assert.deepEqual(failed.calls, ['isolation', 'begin', 'candidate', 'lock', 'row', 'recheck', 'claim', 'rollback', 'release']);
  await assert.rejects(claim(connection({ acquired: null })), /claim lock unavailable/);
});

test('a row claimed between selection and locking never consumes an attempt', async () => {
  const taken = connection({ lockedJob: false });
  assert.equal(await claim(taken), null);
  assert.equal(taken.calls.includes('claim'), false);
  assert.equal(taken.calls.includes('recheck'), false);
  assert.ok(taken.calls.includes('release'));
});
