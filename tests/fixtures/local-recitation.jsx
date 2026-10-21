import React from 'react';
import { createRoot } from 'react-dom/client';
import TeacherEvaluationDialog from '../../src/components/portal/TeacherEvaluationDialog';
import { studentsApi } from '../../src/services/studentsApi';
import { offlineRecitationStore } from '../../src/services/offlineRecitationStore';
import { partitionRecitationSessionTasks } from '../../shared/recitation-session-scope';
import { attachRecitationOutcomes } from '../../shared/recitation-outcomes';
import { Toaster } from '../../src/components/ui/toaster';
import '../../src/index.css';
if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local only');
const date = '2026-10-13';
const scenario = new URLSearchParams(location.search);
const positions = [1, 2, 3, 4, 5, 6, 7, 8].map(ayah => ({ page: 597, surah: 95, surahName: 'التين', ayah }));
const reviewOptions = [114, 113, 112, 67].flatMap(surah => [1, 2, 3].map(ayah => ({ page: 604, surah, ayah, surahName: { 114: 'الناس', 113: 'الفلق', 112: 'الإخلاص', 67: 'الملك' }[surah] })));
const base = { planId: 1, studentId: 7, studentName: 'طالب اختبار', taskDate: date, track: 'memorization', teacherCompleted: null, nazemManaged: false, planDirection: -1 };
const tasks = [{ ...base, id: 1, taskType: 'memorization', fromPage: 597, fromSurah: 95, fromAyah: 5, fromSurahName: 'التين', toPage: 597, toSurah: 95, toAyah: 8, toSurahName: 'التين', targetPages: 1, options: positions.slice(4), normalEnd: positions.at(-1) },
  ...[2, 3, 4].map(id => ({ ...base, id, taskType: 'link', fromSurah: 114, fromAyah: id, toSurah: 114, toAyah: id, fromSurahName: 'الناس', toSurahName: 'الناس', fromPage: 604, toPage: 604, targetPages: 1 })),
  { ...base, id: 5, taskType: 'review', fromPage: 604, fromSurah: 114, fromAyah: 1, fromSurahName: 'الناس', toPage: 562, toSurah: 67, toAyah: 3, toSurahName: 'الملك', targetPages: 10, normalEnd: reviewOptions.at(-1), reviewStart: reviewOptions[0], reviewExpectedFaces: 10, options: reviewOptions }];
tasks[0].toAyah = 6;
tasks.push(...[7, 8].map((ayah, index) => ({ ...tasks[0], id: 6 + index, fromAyah: ayah, toAyah: ayah, targetPages: 0.25 })),
  { ...tasks[0], id: 10, taskDate: '2026-10-12', fromAyah: 1, toAyah: 2 },
  { ...tasks[0], id: 11, taskDate: '2026-10-12', fromAyah: 3, toAyah: 4 },
  { ...tasks[4], id: 12, taskDate: '2026-10-12' },
  { ...tasks[1], id: 13, taskDate: '2026-10-12' });
const evaluation = { date, generationEndDate: date, students: [{ studentId: 7, studentName: 'طالب اختبار', attendanceStatus: 'present' }], tasks, taskQueue: tasks,
  allowQuranCompensation: true,
  executionSources: { memorization: 'teacher', review: 'teacher', link: 'teacher' }, evaluationModes: { memorization: 'count', review: 'count', link: 'count' }, evaluationPolicies: {} };
if (scenario.has('backgroundRefresh')) {
  for (let studentId = 8; studentId <= 67; studentId++) {
    const studentName = `طالب متابعة ${studentId}`;
    evaluation.students.push({ studentId, studentName, attendanceStatus: 'present' });
    tasks.push({ ...tasks[0], id: 100 + studentId, studentId, studentName });
  }
}
const state = { evaluationCalls: 0, cacheWrites: 0, ayahCalls: 0, rangeCalls: [], commits: [], releaseRange: null };
state.delaySync = scenario.has('delaySync');
state.failCommit = scenario.has('failCommit');
studentsApi.getSupervisorQuranEvaluation = async () => {
  state.evaluationCalls++;
  if (state.delayEvaluation) {
    state.delayEvaluation = false;
    await new Promise(resolve => { state.releaseEvaluation = resolve; });
  }
  if (state.failEvaluation) throw Object.assign(new Error('فشل قراءة الجلسة التجريبي'), {
    status: typeof state.failEvaluation === 'number' ? state.failEvaluation : 503,
  });
  const deliveryReceipts = state.commits.filter(session => session.status === 'synced')
    .flatMap(session => session.tasks.filter(item => item.synced && item.result?.ok).map(item => ({
      ...tasks.find(task => task.id === item.taskId), ...item.result,
      taskId: item.taskId, status: 'server_saved',
    })));
  const recordedIds = new Set(deliveryReceipts.map(item => item.taskId));
  const finishedDaily = new URLSearchParams(location.search).has('finishedDaily');
  const pendingTasks = tasks.filter(task => !recordedIds.has(task.id) && !(finishedDaily && task.taskDate === date)
    && (!scenario.has('dailyOnly') || task.taskDate === date)
    && (!scenario.has('singleTask') || task.taskType === 'memorization'));
  const scope = partitionRecitationSessionTasks(pendingTasks, date, true);
  return { ...evaluation, deliveryReceipts, students: attachRecitationOutcomes(evaluation.students.map(student => ({ ...student,
    recitationFinished: finishedDaily && !scope.dailyStudentIds.has(student.studentId),
  })), deliveryReceipts), tasks: scope.dailyTasks, compensationTasks: scope.compensationTasks, taskQueue: pendingTasks };
};
studentsApi.getQuranChapters = async () => [{ number: 95, name: 'التين', ayahCount: 8 }];
studentsApi.getSupervisorQuranTaskAyahs = async () => { state.ayahCalls++; return {}; };
studentsApi.prepareSupervisorQuranRange = async (_teacher, id, payload) => {
  state.rangeCalls.push(payload);
  await new Promise(resolve => { state.releaseRange = resolve; });
  const selected = tasks.filter(task => payload.taskIds.includes(task.id) && task.fromAyah <= payload.actualEnd.ayah).map(task => ({ ...task,
    actualToSurah: payload.actualEnd.surah, actualToAyah: Math.min(task.toAyah, payload.actualEnd.ayah), actualToPage: 597 }));
  return { taskIds: selected.map(task => task.id), tasks: selected, actualEnd: payload.actualEnd };
};
offlineRecitationStore.getSnapshot = async () => null;
offlineRecitationStore.cacheSnapshot = async () => { state.cacheWrites++; };
offlineRecitationStore.getSessions = async (_actor, statuses = []) => state.commits.filter(session => !statuses.length || statuses.includes(session.status));
offlineRecitationStore.getActions = async () => [];
offlineRecitationStore.getMeta = async () => null;
offlineRecitationStore.setMeta = async () => {};
offlineRecitationStore.getDeviceContext = async () => ({ deviceId: 'qa' });
offlineRecitationStore.getDraft = async () => null;
offlineRecitationStore.saveDraft = async () => {};
offlineRecitationStore.commitSession = async (_actor, session) => {
  if (state.failCommit) throw new Error('تعذر الحفظ على الجهاز.');
  const saved = { ...session, status: 'pending' }; state.commits.push(saved); return saved;
};
offlineRecitationStore.updateSession = async (_actor, id, changes) => {
  const session = state.commits.find(item => item.sessionId === id);
  Object.assign(session, changes);
  return session;
};
studentsApi.syncOfflineRecitationBatch = async sessions => {
  if (state.delaySync) await new Promise(resolve => { state.releaseSync = resolve; });
  if (state.failSync) throw new Error('تعذر الاتصال بالخادم.');
  return { results: sessions.map(session => ({ sessionId: session.sessionId,
    result: state.rejectSync ? 'conflict' : 'accepted',
    tasks: session.tasks.map(item => ({ taskId: item.taskId, result: state.rejectSync ? 'conflict' : 'accepted',
      ...(state.rejectSync ? { message: 'تعذر اعتماد التقييم التجريبي.' } : { data: { ok: true,
        teacherCompleted: !item.payload.notMemorized, evaluationScore: item.payload.notMemorized ? 0 : 20,
        evaluationMaxScore: 20, syncStatus: 'synced' } }),
    })),
  })) };
};
globalThis.localRecitationFixture = state;
createRoot(document.getElementById('root')).render(<><div id="dashboard-mobile-header-actions" /><TeacherEvaluationDialog supervisorId="990" inline /><Toaster /></>);
