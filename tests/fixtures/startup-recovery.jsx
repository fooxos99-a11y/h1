import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../src/App';
import { BrowserRouter } from '../../src/lib/router';
import { SiteProvider } from '../../src/site/SiteProvider';
import { offlineRecitationStore } from '../../src/services/offlineRecitationStore';
import '../../src/index.css';

const settings = { quranTaskExecutionSource: 'teacher', recitationAttendanceSource: 'teacher', staffAttendanceSource: 'supervisor', pointsSystemEnabled: false };
const evaluation = {
  date: '2026-10-18', generationEndDate: '2026-10-18',
  students: [{ studentId: 7, studentName: 'طالب محلي تجريبي', attendanceStatus: 'present' }],
  tasks: [{ id: 11, studentId: 7, studentName: 'طالب محلي تجريبي', planId: 2, taskType: 'memorization',
    taskDate: '2026-10-18', fromPage: 597, fromSurah: 95, fromAyah: 1, fromSurahName: 'التين',
    toPage: 597, toSurah: 95, toAyah: 8, toSurahName: 'التين', targetPages: 1 }],
  evaluationModes: { memorization: 'count', review: 'count', link: 'count' }, evaluationPolicies: {},
  executionSources: { memorization: 'teacher', review: 'teacher', link: 'teacher' },
};
const scenario = new URLSearchParams(location.search).get('scenario') || 'cache';
localStorage.setItem('madarij_web_session', '1');
localStorage.setItem('wajeh_role', 'supervisor');
localStorage.setItem('wajeh_supervisor_id', '990');
localStorage.setItem('wajeh_name', 'معلم تجريبي');
localStorage.setItem('wajeh_dashboard_permissions', '["quranEvaluation","students"]');
localStorage.setItem('rawasi_public_settings_v1_default', JSON.stringify({ savedAt: Date.now(), value: settings }));
offlineRecitationStore.getSnapshot = async key => key.endsWith(':bootstrap') || scenario === 'no-cache' ? null : evaluation;
offlineRecitationStore.cacheSnapshot = async () => {};
offlineRecitationStore.getSessions = async () => [];
offlineRecitationStore.getActions = async () => [];
offlineRecitationStore.getMeta = async () => null;
offlineRecitationStore.setMeta = async () => {};
offlineRecitationStore.getDeviceContext = async () => ({ deviceId: 'startup-local-fixture' });
globalThis.startupRecoveryFixture = { settings, evaluation };
createRoot(document.getElementById('root')).render(<SiteProvider><BrowserRouter><App /></BrowserRouter></SiteProvider>);
