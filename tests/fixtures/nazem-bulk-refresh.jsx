import React from 'react';
import { createRoot } from 'react-dom/client';
import NazemBulkRefresh from '../../src/components/dashboard/NazemBulkRefresh';
import { nazemIntegrationApi } from '../../src/services/nazemIntegrationApi';
import '../../src/index.css';

globalThis.bulkFixture = { calls: [], polls: 0 };
nazemIntegrationApi.refreshImportData = async (teacherId) => {
  globalThis.bulkFixture.calls.push(teacherId);
  return { jobId: teacherId, status: 'pending' };
};
nazemIntegrationApi.getImportRefreshStatus = async () => {
  globalThis.bulkFixture.polls += 1;
  return { status: 'synced', result: { planChanges: [] } };
};
createRoot(document.getElementById('root')).render(
  <main className="p-4">
    <NazemBulkRefresh accounts={[
      { teacherId: 1, teacherName: 'المعلم الأول', status: 'connected' },
      { teacherId: 2, teacherName: 'المعلم الثاني', status: 'connected' },
      { teacherId: 3, teacherName: 'غير مرتبط', status: 'failed' },
    ]} onChanged={async () => {}} />
  </main>,
);
