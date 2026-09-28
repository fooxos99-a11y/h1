import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getStudentPointSourceLabel } from '../shared/student-point-sources.js';
import { buildStudentPointsReport } from '../server/services/studentPointsReport.js';

test('student report identifies program and station transactions without changing their points', async () => {
  const connection = { query: async () => [[
    { studentId: 1, id: 10, type: 'increase', points: 20, sourceType: 'learning_path' },
    { studentId: 1, id: 11, type: 'increase', points: 15, sourceType: 'summit_station' },
  ]] };
  const report = await buildStudentPointsReport(connection, { from: '2026-09-01', to: '2026-09-28', sourceLabel: getStudentPointSourceLabel });
  assert.deepEqual(report.rows[0].transactions.map(row => row.source), ['البرامج', 'المحطات']);
  assert.equal(report.rows[0].total, 35);
  assert.equal(getStudentPointSourceLabel('unknown'), 'مصدر غير محدد');
});

test('student points report is shown only for enabled teacher adjustments', async () => {
  const [reports, pointsTable, dashboard, api, server, administrators, popover] = await Promise.all([
    readFile(new URL('../src/components/dashboard/ReportsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/ReportsStudentPoints.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/WajehDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/studentsApi.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/AdministratorsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ui/popover.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(reports, /if \(canViewTeacherPoints\) loadList\('teacherPoints', listLoaders\.teacherPoints\)/);
  assert.match(reports, /showTeacherPoints: canViewTeacherPoints && !archiveId/);
  assert.match(dashboard, /canViewTeacherPoints=\{settings\.teacherManualPointsEnabled\}/);
  assert.match(api, /\/reports\/student-points/);
  assert.match(server, /app\.get\('\/api\/reports\/student-points'/);
  assert.match(server, /if \(!settings\.pointsSystemEnabled\)/);
  assert.match(server, /WHERE s\.committee_id = \?/);
  assert.match(server, /app\.get\('\/api\/reports\/teacher-points'/);
  assert.match(server, /t\.source_type IN \('supervisor_award', 'supervisor_deduction'\)/);
  assert.match(pointsTable, /row\.committeeName/);
  assert.match(pointsTable, /row\.points/);
  assert.match(administrators, /<PopoverContent[\s\S]*z-\[160\]/);
  assert.match(administrators, /flex min-w-0 flex-1 flex-wrap/);
  assert.doesNotMatch(administrators, /option\.description/);
  assert.match(administrators, /whitespace-normal break-words/);
  assert.match(administrators, /useMediaQuery\('\(max-width: 639px\)'\)/);
  assert.match(administrators, /grid-rows-\[auto_minmax\(0,1fr\)_auto\]/);
  assert.match(administrators, /overflow-y-auto overscroll-contain touch-pan-y \[-webkit-overflow-scrolling:touch\]/);
  assert.match(popover, /PopoverPrimitive\.Portal/);
});
