import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('staff rankings stay inside dashboard and reuse student rankings without circle filtering', async () => {
  const read = path => readFile(new URL(path, import.meta.url), 'utf8');
  const [dashboard, routes, section, service] = await Promise.all([
    read('../src/pages/WajehDashboard.jsx'), read('../src/lib/sectionRoutes.js'),
    read('../src/components/dashboard/RankingsSection.jsx'), read('../src/services/studentHomeService.js'),
  ]);
  assert.match(dashboard, /section.key === 'rankings'\) return isManager \|\| isSupervisor \|\| isAdmin/);
  assert.match(dashboard, /case 'rankings': return <RankingsSection/);
  assert.match(routes, /\['rankings', 'rankings'\]/);
  assert.match(section, /<StudentHomeRankings/);
  assert.match(service, /getStudentRankings\(\{ committeeId: 'all' \}\)/);
});
