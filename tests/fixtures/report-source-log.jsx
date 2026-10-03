import React from 'react';
import { createRoot } from 'react-dom/client';
import MetricDetails from '../../src/components/dashboard/reports/MetricDetails';
import { buildReportMetrics } from '../../src/components/dashboard/reports/reportMetrics';
import '../../src/index.css';

const metric = buildReportMetrics({ totals: {}, committeeIndicators: [] }, {
  student: '1', showStudentPoints: true,
  lists: { studentPoints: { rows: [{ studentId: 1, studentName: 'طالب الاختبار', balance: 25, total: 25, transactions: [
    { id: 3, source: '', date: '2026-09-03', reason: 'الحركة الأحدث', type: 'increase', points: 7 },
    { id: 2, source: 'تقييم جلسة التسميع', date: '2026-09-02', reason: 'درجة التسميع', type: 'increase', points: 10 },
    { id: 1, source: null, date: '2026-09-01', reason: 'الحركة الأقدم', type: 'increase', points: 8 },
  ] }] } },
}).find(row => row.id === 'studentPoints');

createRoot(document.getElementById('root')).render(
  <MetricDetails metric={metric} periodLabel="هذه السنة" onClose={() => {}} onStudentChange={() => {}} />,
);
