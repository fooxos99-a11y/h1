import React from 'react';
import { createRoot } from 'react-dom/client';
import NazemLogDialog from '../../src/components/dashboard/NazemLogDialog';
import { nazemIntegrationApi } from '../../src/services/nazemIntegrationApi';
import '../../src/index.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local test only');
nazemIntegrationApi.getLog = async () => [
  { id: 1, jobId: 1, teacherId: 1, studentId: 1, studentName: 'الطالب السابق', teacherName: 'المعلم', taskDate: '2026-09-28', createdAt: '2026-09-28 08:00:00', operationType: 'recitation.submit', entryKind: 'current', status: 'synced' },
  { id: 2, jobId: 2, teacherId: 1, studentId: 2, studentName: 'الطالب صاحب آخر تحديث', teacherName: 'المعلم', taskDate: '2026-09-01', createdAt: '2026-09-28 12:30:00', operationType: 'recitation.submit', entryKind: 'current', status: 'pending' },
  { id: 3, jobId: 3, teacherId: 2, teacherName: 'المعلم', createdAt: '2026-09-28 11:30:00', operationType: 'account.refresh_followups', entryKind: 'current', status: 'requires_review',
    errorCode: 'NAZEM_FOLLOW_UP_PARTIAL', message: 'تحتاج متابعة طالب إلى مراجعة.', diagnostics: { issues: [{ studentId: 69, studentName: 'الطالب صاحب المقدار المتبقي', taskDate: '2026-09-20', taskType: 'memorization', code: 'NAZEM_STARTED_TASK_RANGE_CHANGED' }] } },
  { id: 4, jobId: 4, teacherId: 1, studentId: 4, studentName: 'الطالب صاحب المتأخر', teacherName: 'المعلم', taskType: 'memorization', taskDate: '2026-09-01', createdAt: '2026-09-28 10:30:00', operationType: 'recitation.submit', entryKind: 'current', status: 'synced', latePending: true, resultStatus: 'not_completed' },
  { id: 5, jobId: 5, teacherId: 3, teacherName: 'المعلم', createdAt: '2026-09-28 09:30:00', operationType: 'account.refresh_followups', entryKind: 'current', status: 'failed', errorCode: 'NAZEM_STUDENT_PROFILES_FAILED', message: 'تعذر تحميل بيانات الطلاب التفصيلية من ناظم.' },
];
createRoot(document.getElementById('root')).render(<NazemLogDialog open onOpenChange={() => {}} />);
