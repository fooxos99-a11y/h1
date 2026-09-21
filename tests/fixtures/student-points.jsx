import React from 'react';
import { createRoot } from 'react-dom/client';
import ReportsSection from '../../src/components/dashboard/ReportsSection';
import SummitJourneySection from '../../src/components/portal/SummitJourneySection';
import StudentPlanFeedback from '../../src/components/portal/StudentPlanFeedback';
import { studentsApi } from '../../src/services/studentsApi';
import { Toaster } from '../../src/components/ui/toaster';
import '../../src/index.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local fixture only');
localStorage.setItem('wajeh_role', 'manager');
const state = { points: 20, saved: [], requests: [] };
globalThis.studentPointsFixture = state;
studentsApi.getReportCommittees = async () => [{ id: 1, name: 'حلقة الاختبار' }];
studentsApi.getReportArchives = async () => [];
studentsApi.getOverviewReport = async () => ({});
studentsApi.getStudentPointTransactionsReport = async (params) => {
  state.requests.push(params);
  return { period: params, rows: [
    { studentId: 1, studentName: 'خالد السعوي — بيانات اختبار', committeeName: 'حلقة الاختبار', balance: 360,
      increases: 122, deductions: 15, total: 107, transactions: [
        { id: 1, type: 'increase', points: 122, source: 'التسميع', reason: 'تقييم الحفظ', date: '2026-09-08', actorName: 'معلم الاختبار' },
        { id: 2, type: 'deduction', points: 15, source: 'يدوي', reason: 'تصحيح تقييم', date: '2026-09-08', actorName: 'معلم الاختبار' },
      ] },
    { studentId: 2, studentName: 'أحمد — بيانات اختبار', committeeName: 'حلقة الاختبار', balance: 50,
      increases: 0, deductions: 0, total: 0, transactions: [] },
  ] };
};
studentsApi.getSummitJourney = async () => ({ points: state.points, displayedKilometers: 20, totalKilometers: 1000,
  activeStation: null, stages: [], mapConfig: { activeStationId: null, cities: [], stations: [], goal: { enabled: false } } });
studentsApi.updateSummitProgress = async (points) => { state.saved.push(points); return { kilometers: points }; };
createRoot(document.getElementById('root')).render(<><div className="p-3"><ReportsSection /></div>
  {location.search === '?status' && <div data-testid="feedback"><StudentPlanFeedback tasks={[
    { id: 1, teacherCompleted: true, teacherRatingKey: 'repeat_required', teacherRatingLabel: 'يحتاج إعادة' },
    { id: 2, teacherCompleted: false, nazemSource: true, teacherRatingLabel: 'يحتاج إعادة' },
  ]} /></div>}
  {location.search === '?map' && <SummitJourneySection onBack={() => {}} />}<Toaster /></>);
