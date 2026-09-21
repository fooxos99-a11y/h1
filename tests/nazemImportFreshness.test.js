import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { includeNazemPlanStudents } from '../server/integrations/nazem/planStudents.js';

test('plan members missing from the picker are included by ID with their source circle', () => {
  const existing = { externalId: '12', name: 'طالب سابق', profile: { phone: 'test' } };
  const result = includeNazemPlanStudents([existing], [
    { student_id: 12, student_name: 'اسم مختلف' },
    { student_id: 13, student_name: 'سليمان عبدالعزيز' },
    { student_id: 13, student_name: 'سليمان عبدالعزيز' },
    { student_name: 'بدون معرف' },
  ], { organizationName: 'المجمع', circleName: 'الحلقة' });
  assert.equal(result.length, 2);
  assert.equal(result[0], existing);
  assert.deepEqual(result[1], { externalId: '13', name: 'سليمان عبدالعزيز',
    organization: { id: null, name: 'المجمع' }, circle: { id: null, name: 'الحلقة' } });
});

test('matching names do not merge different external students or invent context', () => {
  const result = includeNazemPlanStudents([{ externalId: '12', name: 'سليمان' }], [
    { student_id: 13, student_name: 'سليمان' }, { student_id: 14, student_name: '' },
  ], {});
  assert.equal(result.length, 2);
  assert.equal(result[1].circle.name, null);
});

test('import refresh cannot reuse a running periodic job with an already-claimed payload', async () => {
  const routes = await readFile(new URL('../server/routes/nazemIntegrationRoutes.js', import.meta.url), 'utf8');
  const endpoint = routes.slice(routes.indexOf("router.post('/accounts/:teacherId/refresh-import'"), routes.indexOf("router.get('/accounts/:teacherId/refresh-import/:jobId'"));
  assert.match(endpoint, /status = 'syncing' AND lease_expires_at >= NOW\(3\)\s+AND JSON_UNQUOTE\(JSON_EXTRACT\(payload_json, '\$\.requestedFrom'\)\) = 'student-plan-import'/);
  const service = await readFile(new URL('../server/integrations/nazem/service.js', import.meta.url), 'utf8');
  assert.match(service, /discoveryResult\?\.students\) remoteStudents = discoveryResult.students;\s+const studentDiscovery = await saveDiscoveredStudents/);
});
