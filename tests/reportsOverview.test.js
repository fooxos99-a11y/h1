import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { reportPeriodStart, reportRange } from '../src/lib/reportPeriods.js';
import { buildOverviewRankings } from '../server/services/overviewRankings.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('report periods start on Sunday, the first of the month, quarter or year', () => {
  assert.equal(reportPeriodStart('week', '2026-09-24'), '2026-09-20');
  assert.equal(reportPeriodStart('month', '2026-09-24'), '2026-09-01');
  assert.equal(reportPeriodStart('quarter', '2026-09-24'), '2026-07-01');
  assert.equal(reportPeriodStart('year', '2026-09-24'), '2026-01-01');
  assert.deepEqual(reportRange('month', {}, '2026-09-24'), { from: '2026-09-01', to: '2026-09-24' });
  assert.deepEqual(reportRange('custom', { from: '2026-09-10', to: '2026-09-02' }, '2026-09-24'), { from: '2026-09-02', to: '2026-09-10' });
});

test('statistics are indicator cards with details, then the best students and circles and the teachers', async () => {
  const [reports, metrics, card, details, server, dashboard, permissions, portal] = await Promise.all([
    read('../src/components/dashboard/ReportsSection.jsx'),
    read('../src/components/dashboard/reports/reportMetrics.js'),
    read('../src/components/dashboard/reports/MetricCard.jsx'),
    read('../src/components/dashboard/reports/MetricDetails.jsx'),
    read('../server/index.js'),
    read('../src/pages/WajehDashboard.jsx'),
    read('../src/lib/dashboardPermissions.js'),
    read('../src/pages/AccountPortal.jsx'),
  ]);
  assert.match(reports, /<MetricCard key=\{metric\.id\} metric=\{metric\}/);
  assert.match(reports, /<RankingPanels bestStudents=\{overview\.bestStudents\} bestCommittees=\{overview\.bestCommittees\} unit=\{rewardUnits\.singular\} \/>/);
  assert.match(reports, /!teacherScoped && \(\s*<TeachersPanel teachers=\{overview\.teachers\}/);
  assert.match(reports, /<SelectLabel>الأرشيف<\/SelectLabel>/);
  assert.doesNotMatch(reports, /تصدير|exportReport|sendReportWhatsApp/);
  assert.match(card, /prefers-reduced-motion: reduce/);
  assert.match(card, /min-h-48[^"]*rounded-2xl border border-border bg-card/);
  assert.match(details, /<DialogTitle className="truncate text-base">تفاصيل \{metric\.label\}<\/DialogTitle>/);
  assert.match(details, /showCommittees && \([\s\S]*label="الحلقة"[\s\S]*allLabel="كل الحلقات" allValue=\{ALL_COMMITTEES\}/);
  assert.match(details, /students\.length > 0 && \([\s\S]*label="الطالب"[\s\S]*allLabel="جميع الطلاب" allValue=\{ALL_STUDENTS\}/);
  assert.match(reports, /setDetailCommittee\(ALL_COMMITTEES\); setDetailStudent\(ALL_STUDENTS\); setSelectedId\(item\.id\);/);
  assert.match(metrics, /const inCommittee = \(name\) => !filtered \|\| name === committee;/);
  assert.match(metrics, /label: unitText\('نقاط الطلاب'\)/);
  assert.match(server, /\.\.\.await buildOverviewRankings\(reportDb, \{ from: startDate, to: endDate, attendanceDates, attendanceWeekDays, committeeIndicators \}\)/);
  assert.match(dashboard, /\{ key: 'reports', label: 'الإحصائيات', icon: BarChart3 \}/);
  assert.match(permissions, /\{ key: 'reports', label: 'الإحصائيات' \}/);
  assert.match(portal, /label: 'إحصائيات الحلقة'/);
  assert.doesNotMatch(dashboard + permissions + portal, /'التقارير'|تقارير الحلقة/);
});

test('choosing a student in the points details opens the points log of that student with its sources', async () => {
  const { buildReportMetrics, ALL_STUDENTS } = await import('../src/components/dashboard/reports/reportMetrics.js');
  const rows = [
    { studentId: 1, studentName: 'أحمد', committeeName: 'النور', balance: 120, total: 7, transactions: [
      { id: 1, type: 'increase', points: 10, source: 'التسميع', reason: 'التسميع', date: '2026-09-02', actorName: 'المعلم' },
      { id: 2, type: 'deduction', points: 3, source: 'الحضور', reason: 'تأخر', date: '2026-09-03', actorName: 'المشرف' },
    ] },
    { studentId: 2, studentName: 'خالد', committeeName: 'الفجر', balance: 5, total: 0, transactions: [] },
  ];
  const overview = { committeeIndicators: [], totals: {} };
  const pointsOf = (options) => buildReportMetrics(overview, { lists: { studentPoints: { rows } }, showStudentPoints: true, ...options }).find((metric) => metric.id === 'studentPoints');
  const all = pointsOf({});
  assert.equal(all.student, ALL_STUDENTS);
  assert.deepEqual(all.studentOptions.map((option) => option.label), ['أحمد', 'خالد']);
  assert.deepEqual(all.records.map((group) => group.title), ['الطلاب']);
  const log = pointsOf({ student: '1' });
  assert.equal(log.student, '1');
  assert.deepEqual(log.tiles.map((tile) => [tile.label, tile.display]), [['صافي الفترة', '7'], ['الإضافات', '10'], ['الخصومات', '3'], ['الرصيد الكلي', '120']]);
  assert.deepEqual(log.bars[0].rows.map((row) => row.label), ['التسميع', 'الحضور']);
  assert.deepEqual(log.records, []);
  assert.deepEqual(log.bars[0].rows[0].records.map(row => row.label), ['التسميع']);
  assert.match(log.bars[0].rows[1].records[0].note, /تأخر · .*2026-09-03.* · بواسطة: المشرف/);
  assert.equal(pointsOf({ student: '1', committee: 'الفجر' }).student, ALL_STUDENTS, 'A student outside the chosen circle falls back to all students');
});

test('source logs isolate unknown sources and preserve oldest-first order and totals', async () => {
  const { buildReportMetrics } = await import('../src/components/dashboard/reports/reportMetrics.js');
  const transactions = [
    { id: 3, date: '2026-09-03', source: '', points: 7, type: 'increase' },
    { id: 2, date: '2026-09-02', source: 'التسميع', points: 10, type: 'increase' },
    { id: 1, date: '2026-09-01', source: null, points: 3, type: 'deduction' },
  ];
  const metric = buildReportMetrics({ totals: {}, committeeIndicators: [] }, {
    showStudentPoints: true, student: '1', lists: { studentPoints: { rows: [{ studentId: 1, studentName: 'طالب', total: 14, balance: 14, transactions }] } },
  }).find(row => row.id === 'studentPoints');
  const unknown = metric.bars[0].rows.find(row => row.label === 'مصدر غير محدد');
  assert.equal(unknown.records.length, 2);
  assert.match(unknown.records[0].note, /2026-09-01/);
  assert.match(unknown.records[1].note, /2026-09-03/);
  assert.equal(metric.bars[0].rows.find(row => row.label === 'التسميع').records.length, 1);
  assert.deepEqual(transactions.map(row => row.id), [3, 2, 1]);
  assert.equal(metric.records.length, 0);
});

test('rankings order students and circles by earned points and weight teacher achievement by students', async () => {
  const calls = [];
  const reportDb = {
    student: () => '1=1',
    committee: () => '1=1',
    staff: () => '1=1',
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (sql.includes('FROM student_point_transactions t\n     JOIN students')) {
        return [[
          { id: 1, name: 'خالد', committeeName: 'الفجر', points: 40 },
          { id: 2, name: 'أحمد', committeeName: 'النور', points: 90 },
        ]];
      }
      if (sql.includes('FROM committees c')) {
        return [[
          { id: 1, name: 'الفجر', studentsCount: 4, points: 40 },
          { id: 2, name: 'النور', studentsCount: 1, points: 90 },
          { id: 3, name: 'الهدى', studentsCount: 2, points: 0 },
        ]];
      }
      if (sql.includes('FROM supervisors sp')) return [[{ id: 7, name: 'المعلم', committees: 'الفجر، النور', committeeIds: '1,2' }]];
      if (sql.includes('supervisor_attendance_records')) return [[{ teacherId: 7, attended: 3, late: 1, absent: 1 }]];
      return [[]];
    },
  };
  const result = await buildOverviewRankings(reportDb, {
    from: '2026-09-01',
    to: '2026-09-30',
    attendanceDates: ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'],
    attendanceWeekDays: [0, 1, 2, 3, 4],
    committeeIndicators: [
      { id: 1, studentsCount: 4, overallPercentage: 50 },
      { id: 2, studentsCount: 1, overallPercentage: 100 },
    ],
  });
  assert.deepEqual(result.bestStudents.map((row) => row.name), ['أحمد', 'خالد']);
  assert.deepEqual(result.bestCommittees.map((row) => [row.name, row.average]), [['النور', 90], ['الفجر', 10]]);
  assert.equal(result.teachers[0].attendance.percentage, 75);
  assert.equal(result.teachers[0].achievement.percentage, 60);
  assert.ok(calls.every(({ sql }) => !/\$\{/.test(sql)), 'SQL is parameterised');
  assert.deepEqual(calls[0].params, ['2026-09-01', '2026-09-30']);
});
