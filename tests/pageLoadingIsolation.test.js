import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('packaged Mushaf and daily challenge do not block on unrelated workspace preparation', async () => {
  const [mushaf, challenge] = await Promise.all([
    readFile(new URL('../src/components/portal/StudentMushafSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/StudentDailyChallengeSection.jsx', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(mushaf, /await studentsApi.getStudentQuranToday/);
  assert.match(mushaf, /void studentsApi.getStudentQuranToday/);
  assert.match(mushaf, /await getOfflineMushafIndex/);
  assert.doesNotMatch(challenge, /loadOfflineStudentWorkspace|bootstrapOfflineStudent/);
  assert.match(challenge, /await loadOfflineDailyChallenge/);
  assert.match(challenge, /await startOfflineDailyChallenge/);
});
