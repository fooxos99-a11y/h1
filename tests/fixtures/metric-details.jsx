import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import MetricDetails from '../../src/components/dashboard/reports/MetricDetails';
import { buildReportMetrics } from '../../src/components/dashboard/reports/reportMetrics';
import '../../src/index.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local test only');
const rows = Array.from({ length: 18 }, (_, index) => ({
  studentId: index + 1, studentName: `طالب الاختبار ذو الاسم الطويل ${index + 1}`, committeeName: 'حلقة الاختبار', balance: 12345, total: 60,
  transactions: ['الحفظ', 'المراجعة', 'الربط', 'التكرار', 'السماع', 'الحضور'].map((source, sourceIndex) => ({
    id: index * 6 + sourceIndex, type: 'increase', points: 10, source, reason: `اعتماد ${source} من ناظم`, date: '2026-09-28', actorName: 'معلم الاختبار',
  })),
}));
function Fixture() {
  const [open, setOpen] = useState(true);
  const [student, setStudent] = useState('all');
  const [committee, setCommittee] = useState('all');
  const id = new URLSearchParams(location.search).get('metric') || 'studentPoints';
  const metrics = buildReportMetrics({ totals: { studentsCount: 18 }, committeeIndicators: [{ name: 'حلقة الاختبار', studentsCount: 18, students: rows.map(row => ({ id: row.studentId, name: row.studentName })) }] }, {
    lists: { studentPoints: { rows, loading: false } }, showStudentPoints: true, student, committee,
    unitText: value => value.replace('نقاط', 'كيلومترات').replace('النقاط', 'الكيلومترات'),
  });
  return <MetricDetails metric={open ? metrics.find(metric => metric.id === id) : null} periodLabel="سبتمبر 2026" committees={['حلقة الاختبار', 'حلقة أخرى']}
    committee={committee} onCommitteeChange={setCommittee} onStudentChange={setStudent} onClose={() => setOpen(false)} />;
}
createRoot(document.getElementById('root')).render(<Fixture />);
