import React from 'react';
import { createRoot } from 'react-dom/client';
import NazemIntegrationSettings from '../../src/components/dashboard/NazemIntegrationSettings';
import { nazemIntegrationApi } from '../../src/services/nazemIntegrationApi';
import '../../src/index.css';

const accounts = [
  { teacherId: 1, teacherName: 'المعلم الأول', status: 'connected', lastError: 'خطأ المعلم الأول' },
  { teacherId: 2, teacherName: 'المعلم الثاني', status: 'failed', lastError: 'خطأ المعلم الثاني' },
];
nazemIntegrationApi.getConfig = async () => ({ enabled: true, runtime: { ready: true } });
nazemIntegrationApi.getAccounts = async () => accounts;
nazemIntegrationApi.getConflicts = async () => [];
nazemIntegrationApi.getAccountIssues = async (id) => ({
  accountIssue: { message: accounts[id - 1].lastError },
  studentIssues: [{ id, issueKind: 'job', jobId: id, studentName: `طالب ${id}`, message: `خطأ تسميع ${id}`, status: 'failed' }],
});
globalThis.errorFixture = { retries: [] };
nazemIntegrationApi.retryJob = async (id) => { globalThis.errorFixture.retries.push(id); };
createRoot(document.getElementById('root')).render(<NazemIntegrationSettings />);
