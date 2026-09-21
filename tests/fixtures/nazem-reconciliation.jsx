import React from 'react';
import { createRoot } from 'react-dom/client';
import ReportsSection from '../../src/components/dashboard/ReportsSection';
import { nazemIntegrationApi } from '../../src/services/nazemIntegrationApi';
import { studentsApi } from '../../src/services/studentsApi';
import '../../src/index.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local fixture only');
const teacherScoped = new URLSearchParams(location.search).get('role') === 'teacher';
localStorage.setItem('wajeh_role', teacherScoped ? 'supervisor' : 'manager');
studentsApi.getReportCommittees = async () => [{ id: 1, name: 'حلقة الاختبار' }];
studentsApi.getReportArchives = async () => [];
studentsApi.getOverviewReport = async () => ({});
const state = { fail: false, requests: [] };
globalThis.reconciliationFixture = state;
nazemIntegrationApi.getReconciliation = async (query) => {
  state.requests.push(query);
  if (state.fail) throw new Error('تعذر جلب تقرير المطابقة');
  return { rows: [
    { remoteCheckedAt: '2026-09-08 13:00', pointsCheckedAt: '2026-09-08 13:00', dailyId: 1, studentName: 'أحمد — بيانات اختبار', teacherName: 'معلم الاختبار', committeeName: 'حلقة الاختبار', date: '2026-09-08', taskType: 'memorization', expectedPoints: 52, recordedPoints: 52, difference: 0, status: 'matched', importedFromNazem: 'true' },
    { dailyId: 2, studentName: 'خالد — بيانات اختبار', teacherName: 'معلم الاختبار', committeeName: 'حلقة الاختبار', date: '2026-09-08', taskType: 'review', expectedPoints: 12, recordedPoints: 0, difference: 12, status: 'points_review', error: 'تجاوز الحد اليومي' },
    { dailyId: 3, studentName: 'طالب — بيانات اختبار', teacherName: 'معلم الاختبار', committeeName: 'حلقة الاختبار', date: '2026-09-08', taskType: 'review', expectedPoints: null, recordedPoints: null, difference: null, status: 'unverified' },
  ] };
};
createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-6xl p-3"><ReportsSection teacherScoped={teacherScoped} /></main>);
