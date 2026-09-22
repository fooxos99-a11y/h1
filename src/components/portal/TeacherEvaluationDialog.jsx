import { recitationErrorMessage } from '@/lib/recitationErrorMessage';
import { mergeRecitationDeliveryReceipts } from '@/lib/recitationDeliveryReceipts';
import { Button } from '@/components/ui/button';
import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import DashboardMobileHeaderActions from '@/components/dashboard/DashboardMobileHeaderActions';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import CountOnlyEvaluationDialog from '@/components/portal/CountOnlyEvaluationDialog';
import RecitationAmountsToggle from '@/components/portal/RecitationAmountsToggle';
import TeacherRecitationTaskList from '@/components/portal/TeacherRecitationTaskList';
import ErrorState from '@/components/ui/error-state';
import useTeacherEvaluationData from '@/hooks/useTeacherEvaluationData';
import { useToast } from '@/components/ui/use-toast';
import { studentsApi } from '@/services/studentsApi';
import {
  commitOfflineAttendance,
  commitOfflineRecitation,
  loadCachedTaskData,
  mergeLocalTeacherEvaluation,
  prefetchRecitationTasks,
  syncOfflineRecitations,
} from '@/services/offlineRecitationService';
import { sortRecitationTasks } from '@/lib/recitationTaskRanges';
import { advanceRecitationTaskQueue, canAdvanceRecitationSession } from '@/lib/recitationTaskQueue';
import { calculateRecitationScore } from '../../../shared/evaluation-settings.js';
import { canMarkNazemNotCompleted, nazemNotCompletedLabel, countEvaluationItems, hasNazemFixedRange, isNazemLinkTask, isNazemMasteryTask, resolveTaskRecitationMode } from '../../../shared/nazem-recitation-policy.js';

const MushafRecitationDialog = lazy(() => import('@/components/portal/MushafRecitationDialog'));

const assertSessionAccepted = (session) => {
  if (!session || !['rejected_duplicate', 'rejected_permission', 'conflict', 'failed', 'invalid_sequence'].includes(session.status)) return;
  throw new Error(session.status === 'rejected_duplicate'
    ? 'لم يتم اعتماد هذا التقييم لأن الطالب تم تسميعه مسبقًا في نفس اليوم.'
    : (session.lastError || 'تعذر اعتماد هذا التسميع. بقي محفوظًا على الجهاز.'));
};

const evaluationTypeForTask = (task) => (
  task.taskType === 'memorization' && task.track === 'mastery' ? 'mastery' : task.taskType
);

const offlineOutcome = (task, payload, policies) => {
  const type = task.taskType === 'memorization' && task.track === 'mastery' ? 'mastery' : task.taskType;
  const policy = policies?.[type];
  if (!policy) return null;
  const warningCount = Number(payload.warningCount ?? payload.wordMarks?.filter((mark) => mark.markType === 'warning').length ?? 0);
  const mistakeCount = Number(payload.mistakeCount ?? payload.wordMarks?.filter((mark) => mark.markType === 'mistake').length ?? 0);
  const evaluatedFaces = Math.max(
    0.25,
    Number(task.targetPages || 0) || Math.abs(Number(task.toPage || 0) - Number(task.fromPage || 0)) + 1,
  );
  if (payload.notMemorized) {
    return { warningCount: 0, mistakeCount: 0, evaluatedFaces, score: 0, completed: false, notMemorized: true };
  }
  const score = calculateRecitationScore(policy, evaluatedFaces, warningCount, mistakeCount);
  const completed = task.nazemManaged
    && task.taskType === 'memorization'
    && task.track === 'mastery'
    ? true
    : score >= Number(policy.passingScore || 0);
  return { warningCount, mistakeCount, evaluatedFaces, score, completed };
};

import { subscribeRecitationResume } from '@/lib/recitationResume';

const TeacherEvaluationDialog = ({ supervisorId, open = false, onOpenChange, inline = false }) => {
  const { toast } = useToast();
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [isSavingCount, setIsSavingCount] = useState(false);
  const [attendancePendingIds, setAttendancePendingIds] = useState([]);
  const [showAmounts, setShowAmounts] = useState(false);
  const [quranChapters, setQuranChapters] = useState([]);
  const shouldLoad = inline || open;
  const onEvaluationLoaded = useCallback((evaluation) => {
    void prefetchRecitationTasks(supervisorId, evaluation.taskQueue || evaluation.tasks || [], { automatic: true, date: evaluation.date });
  }, [supervisorId]);
  const { data, setData, isLoading, loadError, retryAt, load } = useTeacherEvaluationData(
    supervisorId, shouldLoad, onEvaluationLoaded,
  );

  useEffect(() => {
    setShowAmounts(false);
  }, [shouldLoad, supervisorId]);

  useEffect(() => {
    if (!shouldLoad || quranChapters.length) return undefined;
    let active = true;
    studentsApi.getQuranChapters()
      .then((chapters) => {
        if (active && Array.isArray(chapters)) setQuranChapters(chapters);
      })
      .catch((error) => {
        if (active) toast({ title: 'تعذر تحميل أسماء السور', description: error.message, variant: 'destructive' });
      });
    return () => {
      active = false;
    };
  }, [quranChapters.length, shouldLoad, toast]);

  useEffect(() => {
    if (!shouldLoad) return undefined;
    return subscribeRecitationResume({
      windowTarget: window, documentTarget: document,
      isOnline: () => navigator.onLine !== false,
      refresh: () => { void load({ fresh: true }); },
    });
  }, [load, shouldLoad]);

  useEffect(() => {
    if (!shouldLoad || !(data?.nazemRefreshPending
      || data?.deliveryReceipts?.some((receipt) => receipt.status === 'nazem_pending'))) return undefined;
    const timer = window.setTimeout(() => {
      if (navigator.onLine !== false && document.visibilityState === 'visible') void load({ silent: true });
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [data, load, shouldLoad]);

  useEffect(() => {
    const updateModes = ({ detail }) => {
      if (!detail) return;
      setData((current) => current ? { ...current, evaluationModes: {
        ...current.evaluationModes,
        memorization: detail.memorizationMode,
        mastery: detail.memorizationMode,
        review: detail.reviewMode,
        link: detail.linkMode,
      } } : current);
    };
    window.addEventListener('rawasi-recitation-preferences-updated', updateModes);
    return () => window.removeEventListener('rawasi-recitation-preferences-updated', updateModes);
  }, [setData]);

  const updateAttendance = async (student, status) => {
    const studentId = Number(student.studentId);
    if (data?.recitationAttendanceSource !== 'teacher' || !student.canSetAttendance
      || !studentId || attendancePendingIds.includes(studentId)) return;
    const shouldHideStudent = ['absent', 'excused'].includes(status);
    setAttendancePendingIds((current) => [...current, studentId]);
    setData((current) => {
  if (current) {
    return {
      ...current,
      tasks: shouldHideStudent
        ? (current.tasks || []).filter((task) => Number(task.studentId) !== studentId)
        : current.tasks,
      students: shouldHideStudent
        ? (current.students || []).filter((item) => Number(item.studentId) !== studentId)
        : (current.students || []).map((item) => (
          Number(item.studentId) === studentId ? { ...item, attendanceStatus: status } : item
        )),
    };
  }
  return current;
});
    try {
      await commitOfflineAttendance({
        supervisorId,
        studentId,
        date: data?.date,
        status,
      });
      if (navigator.onLine !== false) {
        await syncOfflineRecitations(supervisorId, { force: true });
        await load({ silent: true });
      }
    } catch (error) {
      toast({ title: 'تعذر حفظ الحضور محليًا', description: error.message, variant: 'destructive' });
    } finally {
      setAttendancePendingIds((current) => current.filter((id) => id !== studentId));
    }
  };

  const prepareRecitation = async (student) => {
    const selectStudent = (selection) => setSelectedStudent({
      ...selection,
      tasks: selection.tasks.map((task) => ({ ...task })),
      evaluationMode: resolveTaskRecitationMode(selection.tasks[0], data?.evaluationModes?.[evaluationTypeForTask(selection.tasks[0])] || 'mushaf'),
    });
    const firstTask = student.tasks?.[0];
    const lastTask = student.tasks?.[student.tasks.length - 1];
    const taskExecutionSource = data?.executionSources?.[firstTask?.taskType] || 'teacher';
    const selectedEndMatchesTasks = student.actualEnd
      && Number(student.actualEnd.page) === Number(lastTask?.toPage)
      && Number(student.actualEnd.surah) === Number(lastTask?.toSurah)
      && Number(student.actualEnd.ayah) === Number(lastTask?.toAyah);
    if (hasNazemFixedRange(firstTask)
      || navigator.onLine === false
      || !['teacher', 'both'].includes(taskExecutionSource)
      || !['memorization', 'review'].includes(firstTask?.taskType)
      || !student.actualEnd
      || selectedEndMatchesTasks) {
      selectStudent(student);
      return;
    }
    try {
      const prepared = await studentsApi.prepareSupervisorQuranRange(supervisorId, firstTask.id, {
        actualEnd: student.actualEnd,
        date: data?.date,
        taskIds: (student.tasks || []).map((task) => task.id),
      });
      const selectedIds = new Set((prepared.taskIds || []).map(Number));
      const refreshed = await studentsApi.getSupervisorQuranEvaluation(supervisorId);
      setData(await mergeLocalTeacherEvaluation(supervisorId, refreshed));
      selectStudent({
        ...student,
        tasks: sortRecitationTasks((refreshed.tasks || []).filter((task) => selectedIds.has(Number(task.id)))),
      });
    } catch (error) {
      toast({ title: 'تعذر تعديل مقدار التسميع', description: error.message, variant: 'destructive' });
    }
  };

  const openRecitation = (student) => {
    prepareRecitation(student);
  };

  const selectedTask = selectedStudent?.tasks?.[0];
  const selectedEvaluationMode = selectedStudent?.evaluationMode || 'mushaf';

  const markRecitationPending = useCallback((studentId, tasks, session) => {
    setData((current) => {
      if (!current) return current;
      const advanced = advanceRecitationTaskQueue(current, tasks, { promote: canAdvanceRecitationSession(session) });
      const remainingTasks = advanced.tasks || [];
      const hasRemainingTasks = remainingTasks.some((task) => Number(task.studentId) === Number(studentId));
      return {
        ...advanced,
        deliveryReceipts: mergeRecitationDeliveryReceipts(current, [session]),
        tasks: remainingTasks,
        students: (advanced.students || [])
          .map((student) => (
            Number(student.studentId) === Number(studentId)
              ? { ...student, recitationFinished: false, recitationPending: !hasRemainingTasks }
              : student
          )),
      };
    });
  }, [setData]);

  const syncRecitationInBackground = useCallback((sessionId) => {
    if (navigator.onLine === false) return;
    void syncOfflineRecitations(supervisorId, { force: true })
      .then((synced) => {
        const savedSession = synced.find((item) => item?.sessionId === sessionId);
        if (savedSession) assertSessionAccepted(savedSession);
        return load({ fresh: true });
      })
      .catch((error) => {
        toast({
          title: 'تعذر اعتماد التسميع',
          description: recitationErrorMessage(error, 'بقي التقييم محفوظًا على الجهاز وتنتظر مزامنته.'),
          variant: 'destructive',
        });
        return load({ fresh: true });
      });
  }, [load, supervisorId, toast]);

  const saveCountOnlyRecitation = async ({ itemCounts }) => {
    if (!selectedStudent?.tasks?.length) return;
    setIsSavingCount(true);
    try {
      const taskPayloads = sortRecitationTasks(selectedStudent.tasks).map((task) => {
        const counts = itemCounts[String(task.id)] || { warningCount: 0, mistakeCount: 0 };
        const payload = {
          evaluationMode: 'count',
          warningCount: counts.warningCount,
          mistakeCount: counts.mistakeCount,
          ...(isNazemLinkTask(task) ? { expectedNazemLinkCount: task.expectedLinkCount } : {}),
          ...(task.taskType === 'memorization' && selectedStudent.repeatCount !== undefined
            ? { repeatCount: selectedStudent.repeatCount }
            : {}),
          ...(task.taskType === 'memorization' && selectedStudent.listeningCount !== undefined
            ? { listeningCount: selectedStudent.listeningCount }
            : {}),
        };
        return { task, payload: { ...payload, offlineOutcome: offlineOutcome(task, payload, data?.evaluationPolicies) } };
      });
      const session = await commitOfflineRecitation({
        supervisorId,
        studentId: selectedStudent.studentId,
        sessionDate: data?.date,
        tasks: taskPayloads,
      });
      markRecitationPending(selectedStudent.studentId, selectedStudent.tasks, session);
      setSelectedStudent(null);
      syncRecitationInBackground(session.sessionId);
    } catch (error) {
      toast({ title: 'تعذر إنهاء التسميع', description: error.message, variant: 'destructive' });
    } finally {
      setIsSavingCount(false);
    }
  };

  const markNotMemorized = async (student) => {
    const memorizationTasks = (student.tasks || []).filter((task) => (
      canMarkNazemNotCompleted(task)
    ));
    if (!memorizationTasks.length || isSavingCount) return;
    setIsSavingCount(true);
    try {
      const session = await commitOfflineRecitation({
        supervisorId,
        studentId: student.studentId,
        sessionDate: data?.date,
        tasks: sortRecitationTasks(memorizationTasks).map((task) => {
          const type = evaluationTypeForTask(task);
          const payload = {
            evaluationMode: task.nazemManaged && task.track === 'mastery' ? 'count' : resolveTaskRecitationMode(task, data?.evaluationModes?.[type] || 'mushaf'),
            ...(isNazemLinkTask(task) ? { expectedNazemLinkCount: task.expectedLinkCount } : {}),
            notMemorized: true,
          };
          return { task, payload: { ...payload, offlineOutcome: offlineOutcome(task, payload, data?.evaluationPolicies) } };
        }),
      });
      markRecitationPending(student.studentId, memorizationTasks, session);
      setSelectedStudent(null);
      toast({ title: nazemNotCompletedLabel(memorizationTasks[0]), description: 'حُفظت النتيجة.' });
      syncRecitationInBackground(session.sessionId);
    } catch (error) {
      toast({ title: 'تعذر حفظ النتيجة محليًا', description: error.message, variant: 'destructive' });
    } finally { setIsSavingCount(false); }
  };

  const canMarkNotCompleted = selectedStudent?.tasks?.length > 0 && selectedStudent.tasks.every((task) => canMarkNazemNotCompleted(task));
  const notCompletedAction = canMarkNotCompleted ? (
    <Button type="button" variant="outline" className="min-h-11 [font-family:var(--font-ui)]" disabled={isSavingCount} onClick={() => void markNotMemorized(selectedStudent)}>
      {isNazemMasteryTask(selectedTask) ? 'لم يتقن' : nazemNotCompletedLabel(selectedStudent.tasks[0])}
    </Button>
  ) : null;

  const content = (
    <div className="space-y-3">
      {loadError && <ErrorState retryAt={retryAt} message={loadError} onRetry={() => void load()} />}
      {(!loadError || Boolean(data?.tasks?.length || data?.students?.length)) && <TeacherRecitationTaskList
        onRefresh={() => void load()}
        tasks={data?.tasks || []}
        taskQueue={data?.taskQueue || []}
        students={data?.students || []}
        quranChapters={quranChapters}
        isLoading={isLoading}
        onRecite={openRecitation}
        onAttendanceChange={data?.recitationAttendanceSource === 'teacher' ? updateAttendance : undefined}
        recitationAttendanceSource={data?.recitationAttendanceSource || 'supervisor'}
        attendancePendingIds={attendancePendingIds}
        teacherExecutionMode={(data?.tasks || []).some((task) => task.nazemManaged)
          || Object.values(data?.executionSources || {}).some((source) => (
            ['teacher', 'both'].includes(source)
          ))}
        teacherAttendanceMode={Boolean(data?.students?.some((student) => (
          student.canSetAttendance || student.nazemManaged
        )))}
        allowRepeatCountEditing={Boolean(data?.allowRepeatCountEditing)}
        listeningEnabled={Boolean(data?.listeningEnabled)}
        listeningCount={Number(data?.listeningCount || 3)}
        allowListeningCountEditing={Boolean(data?.allowListeningCountEditing)}
        executionSources={data?.executionSources}
        showAmounts={showAmounts}
      />}
    </div>
  );

  let recitationDialog;
  if (!selectedStudent) {
    recitationDialog = null;
  } else if (selectedEvaluationMode === 'count') {
      recitationDialog = <CountOnlyEvaluationDialog
      secondaryAction={notCompletedAction}
      open={Boolean(selectedStudent)}
      onOpenChange={(nextOpen) => !nextOpen && setSelectedStudent(null)}
      title={`تسميع ${selectedStudent?.studentName || ''}`}
      onSubmit={saveCountOnlyRecitation}
      isSaving={isSavingCount}
      supervisorId={supervisorId}
      studentId={selectedStudent?.studentId}
      items={countEvaluationItems(selectedStudent?.tasks)}
      showItemLabels={!isNazemLinkTask(selectedTask) && !isNazemMasteryTask(selectedTask)}
      submitLabel={isNazemMasteryTask(selectedTask) ? 'متقن' : 'إنهاء'}
    />;
    } else {
      recitationDialog = <Suspense fallback={<DashboardLoader />}><MushafRecitationDialog
      secondaryAction={notCompletedAction}
      supervisorId={supervisorId}
      student={selectedStudent}
      tasks={selectedStudent?.tasks || []}
      open={Boolean(selectedStudent)}
      onOpenChange={(nextOpen) => !nextOpen && setSelectedStudent(null)}
      loadTaskData={(task) => loadCachedTaskData(supervisorId, task, { preferCache: true })}
      saveSessionResults={async (items) => {
        const session = await commitOfflineRecitation({
          supervisorId,
          studentId: selectedStudent.studentId,
          sessionDate: data?.date,
          tasks: items.map(({ task, payload }) => ({
            task,
            payload: {
              ...payload,
              offlineOutcome: offlineOutcome(task, payload, data?.evaluationPolicies),
              ...(task.taskType === 'memorization' && selectedStudent?.repeatCount !== undefined
                ? { repeatCount: selectedStudent.repeatCount }
                : {}),
              ...(task.taskType === 'memorization' && selectedStudent?.listeningCount !== undefined
                ? { listeningCount: selectedStudent.listeningCount }
                : {}),
            },
          })),
        });
        markRecitationPending(selectedStudent.studentId, items.map(({ task }) => task), session);
        syncRecitationInBackground(session.sessionId);
        return { session, results: [], pending: true };
      }}
      onSaved={() => undefined}
    /></Suspense>;
    }

  if (inline) {
    return (
      <>
        <DashboardMobileHeaderActions>
          <RecitationAmountsToggle
            visible={showAmounts}
            onToggle={() => setShowAmounts((current) => !current)}
            compact
          />
        </DashboardMobileHeaderActions>
        <div className="min-w-0 [font-family:var(--font-ui)]">{content}</div>
        {recitationDialog}
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl bg-card border-primary/30 text-foreground" dir="rtl">
          <DialogHeader className="flex-row items-center justify-between space-y-0">
            <DialogTitle className="text-primary neon-text">جلسات التسميع</DialogTitle>
            <RecitationAmountsToggle
              visible={showAmounts}
              onToggle={() => setShowAmounts((current) => !current)}
            />
          </DialogHeader>
          <div className="max-h-[72dvh] overflow-auto pr-1">{content}</div>
        </DialogContent>
      </Dialog>
      {recitationDialog}
    </>
  );
};

export default TeacherEvaluationDialog;
