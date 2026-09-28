import React from 'react';
import { createRoot } from 'react-dom/client';
import NazemLogDialog from '../../src/components/dashboard/NazemLogDialog';
import { nazemIntegrationApi } from '../../src/services/nazemIntegrationApi';
import '../../src/index.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local test only');
nazemIntegrationApi.getLog = async () => [
  { id: 1, jobId: 1, teacherId: 1, studentId: 1, studentName: 'الطالب السابق', teacherName: 'المعلم', taskDate: '2026-09-28', createdAt: '2026-09-28 08:00:00', operationType: 'recitation.submit', entryKind: 'current', status: 'synced' },
  { id: 2, jobId: 2, teacherId: 1, studentId: 2, studentName: 'الطالب صاحب آخر تحديث', teacherName: 'المعلم', taskDate: '2026-09-01', createdAt: '2026-09-28 12:30:00', operationType: 'recitation.submit', entryKind: 'current', status: 'pending' },
];
createRoot(document.getElementById('root')).render(<NazemLogDialog open onOpenChange={() => {}} />);
