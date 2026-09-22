import React from 'react';
import { createRoot } from 'react-dom/client';
import NazemLogDialog from '../../src/components/dashboard/NazemLogDialog';
import StudentsSection from '../../src/components/dashboard/StudentsSection';
import { nazemIntegrationApi } from '../../src/services/nazemIntegrationApi';
import { studentsApi } from '../../src/services/studentsApi';
import { Toaster } from '../../src/components/ui/toaster';
import '../../src/index.css';
if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local fixture only');
localStorage.setItem('wajeh_role', 'manager');
globalThis.sessionWalletFixture = { saved: [], retries: [] };
studentsApi.getCommittees = async () => [{ id: 1, name: 'حلقة الاختبار' }];
studentsApi.getStudents = async () => [{ id: 2, name: 'محمد', points: 100, storeBalance: 40, committeeId: 1, loginNumber: '123', guardianPhone: '', nationalId: '' }];
studentsApi.updateStudent = async (id, body) => { globalThis.sessionWalletFixture.saved.push({ id, ...body }); };
const common = { teacherId: 1, studentId: 2, studentName: 'محمد', teacherName: 'معلم الاختبار', planId: 3, taskDate: '2026-09-22', operationType: 'recitation.submit', entryKind: 'current', createdAt: '2026-09-22 12:00:00' };
nazemIntegrationApi.getLog = async () => [
  { ...common, id: 1, jobId: 1, taskType: 'memorization', status: 'synced' },
  { ...common, id: 2, jobId: 2, taskType: 'review', status: 'synced' },
  { ...common, id: 3, jobId: 3, taskType: 'link', status: 'blocked', errorCode: 'NAZEM_LINK_WAITING_FOR_MEMORIZATION', message: 'الربط ينتظر الحفظ' },
];
if (location.search.includes('scroll')) {
  nazemIntegrationApi.getLog = async () => Array.from({ length: 30 }, (_, index) => ({
    ...common, id: index + 1, jobId: index + 1, studentId: index + 10,
    studentName: `طالب ${index + 1}`, taskType: 'memorization', status: 'synced',
  }));
}
nazemIntegrationApi.retryJob = async id => { globalThis.sessionWalletFixture.retries.push(id); };
createRoot(document.getElementById('root')).render(<><Toaster />{location.search.includes('wallet') ? <StudentsSection /> : <NazemLogDialog open onOpenChange={() => {}} />}</>);
