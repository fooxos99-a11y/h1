import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyRemoteAttendanceToRuwasi } from '../server/integrations/nazem/service.js';

test('background Nazem attendance performs no writes without an explicit choice', async () => {
  const connection = { query: () => { throw new Error('Unexpected database write'); }, beginTransaction: () => { throw new Error('Unexpected transaction'); } };
  for (const attendanceStatus of [2, 3, 4, 5]) {
    assert.equal(await applyRemoteAttendanceToRuwasi(connection, 1, { date: '2026-09-23', attendanceStatus }), false);
  }
});

test('opening evaluation cannot auto attend and point reconciliation cannot regrant attendance', () => {
  const config = readFileSync(new URL('../server/siteConfig.js', import.meta.url), 'utf8');
  assert.match(config, /nazemAutomaticAttendance: false/);
  const reconcile = readFileSync(new URL('../server/services/nazemPointReconciliation.js', import.meta.url), 'utf8');
  assert.doesNotMatch(reconcile, /saveAttendanceWithPoints/);
  const sessions = readFileSync(new URL('../src/components/portal/home/StudentSessionWeek.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(sessions, /تقييم اليوم شمل مهام/);
});
