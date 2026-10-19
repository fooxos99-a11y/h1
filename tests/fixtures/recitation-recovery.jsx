import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import TeacherEvaluationDialog from '../../src/components/portal/TeacherEvaluationDialog';
import ReportsSection from '../../src/components/dashboard/ReportsSection';
import ConnectedEntryGate from '../../src/components/startup/ConnectedEntryGate';
import { SiteProvider } from '../../src/site/SiteProvider';
import { Toaster } from '../../src/components/ui/toaster';
import { offlineRecitationStore } from '../../src/services/offlineRecitationStore';
import { setTenantRegistrationNumber } from '../../src/services/apiBase';
import '../../src/index.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local test fixture only');
const query = new URLSearchParams(location.search);
const teacherId = Number(query.get('teacher'));
setTenantRegistrationNumber(query.get('registration'));
localStorage.setItem('wajeh_role', 'supervisor');
localStorage.setItem('wajeh_supervisor_id', String(teacherId));
localStorage.setItem('madarij_web_session', '1');
const mode = query.get('mode');
let failDraft = mode === 'draft-read-failure', failWrite = mode === 'draft-write-failure', corruptDraft = mode === 'draft-corrupt';
const getDraft = offlineRecitationStore.getDraft.bind(offlineRecitationStore);
const saveDraft = offlineRecitationStore.saveDraft.bind(offlineRecitationStore);
offlineRecitationStore.getDraft = (...args) => corruptDraft ? Promise.resolve({ mode: 'count', itemCounts: null })
  : failDraft ? Promise.reject(new Error('injected device read failure')) : getDraft(...args);
offlineRecitationStore.saveDraft = (...args) => failWrite && Object.values(args.at(-1)?.itemCounts || {}).some(value => value.mistakeCount >= 2)
  ? Promise.reject(new Error('injected device write failure')) : saveDraft(...args);
globalThis.recitationRecoveryFixture = { mounts: 0, recover: () => { failDraft = false; failWrite = false; corruptDraft = false; } };
function Content() {
  useEffect(() => { globalThis.recitationRecoveryFixture.mounts++; }, []);
  return mode === 'reports' ? <ReportsSection teacherScoped canViewStandardReports /> : <TeacherEvaluationDialog supervisorId={teacherId} inline />;
}
createRoot(document.getElementById('root')).render(<SiteProvider><ConnectedEntryGate><Content /></ConnectedEntryGate><Toaster /></SiteProvider>);
