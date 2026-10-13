import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readNativeRecitationAmountsPreference,
  readRecitationAmountsPreference,
  recitationAmountsPreferenceKey,
  writeNativeRecitationAmountsPreference,
  writeRecitationAmountsPreference,
} from '../src/lib/recitationAmountsPreference.js';

const storageFixture = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test('both show and hide choices survive reading a new session', () => {
  const storage = storageFixture();
  const key = recitationAmountsPreferenceKey('', 11);
  assert.equal(readRecitationAmountsPreference(key, storage), false);
  assert.equal(writeRecitationAmountsPreference(key, true, storage), true);
  assert.equal(readRecitationAmountsPreference(key, storage), true);
  assert.equal(writeRecitationAmountsPreference(key, false, storage), true);
  assert.equal(readRecitationAmountsPreference(key, storage), false);
});

test('a teacher preference does not leak to another teacher or tenant', () => {
  const storage = storageFixture();
  const key = recitationAmountsPreferenceKey('123', 11);
  writeRecitationAmountsPreference(key, true, storage);
  assert.equal(readRecitationAmountsPreference(recitationAmountsPreferenceKey('123', 12), storage), false);
  assert.equal(readRecitationAmountsPreference(recitationAmountsPreferenceKey('124', 11), storage), false);
  assert.equal(readRecitationAmountsPreference(recitationAmountsPreferenceKey('123', '11'), storage), true);
});

test('malformed preferences and missing teacher IDs stay hidden', () => {
  const storage = storageFixture();
  const key = recitationAmountsPreferenceKey('', 11);
  for (const value of ['false', '1', 'invalid', '']) {
    storage.setItem(key, value);
    assert.equal(readRecitationAmountsPreference(key, storage), false);
  }
  for (const id of [null, undefined, '', 0, -1, 'unknown', 1.5]) {
    const missing = recitationAmountsPreferenceKey('', id);
    assert.equal(missing, null);
    assert.equal(readRecitationAmountsPreference(missing, storage), false);
    assert.equal(writeRecitationAmountsPreference(missing, true, storage), false);
  }
});

test('blocked storage is reported without crashing recitation', () => {
  const storage = {
    getItem() { throw new Error('Storage unavailable'); },
    setItem() { throw new Error('Storage unavailable'); },
  };
  const key = recitationAmountsPreferenceKey('', 11);
  assert.equal(readRecitationAmountsPreference(key, storage), false);
  assert.equal(writeRecitationAmountsPreference(key, true, storage), false);
});

test('native choices wait for a durable commit and survive a fresh store instance', async () => {
  const key = recitationAmountsPreferenceKey('', 11);
  const values = new Map();
  let release;
  const committing = { setMeta: (name, value) => new Promise(resolve => {
    release = () => { values.set(name, value); resolve(); };
  }) };
  let finished = false;
  const write = writeNativeRecitationAmountsPreference(key, true, committing).then(result => {
    finished = true;
    return result;
  });
  await Promise.resolve();
  assert.equal(finished, false);
  release();
  assert.equal(await write, true);
  const freshStore = () => ({ getMeta: async name => values.get(name), setMeta: async (name, value) => values.set(name, value) });
  assert.equal(await readNativeRecitationAmountsPreference(key, freshStore()), true);
  assert.equal(await writeNativeRecitationAmountsPreference(key, false, freshStore()), true);
  assert.equal(await readNativeRecitationAmountsPreference(key, freshStore()), false);
});

test('a failed native commit is reported rather than claimed as persistent', async () => {
  const key = recitationAmountsPreferenceKey('', 11);
  const store = { setMeta: async () => { throw new Error('Disk unavailable'); } };
  assert.equal(await writeNativeRecitationAmountsPreference(key, true, store), false);
  assert.equal(await writeNativeRecitationAmountsPreference(null, true, store), false);
});
