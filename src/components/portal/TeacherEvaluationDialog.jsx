import { recitationErrorMessage } from '@/lib/recitationErrorMessage';
import { mergeCommittedOfflineEvaluation } from '@/lib/offlineEvaluationMerge';
import { Button } from '@/components/ui/button';
import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import DashboardMobileHeaderActions from '@/components/dashboard/DashboardMobileHeaderActions';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import CountOnlyEvaluationDialog from '@/components/portal/CountOnlyEvaluationDialog';
import RecitationAmountsToggle from '@/components/portal/RecitationAmountsToggle';
import TeacherRecitationTaskList from '@/components/portal/TeacherRecitationTaskList';
import RecitationPendingStatus from '@/components/portal/RecitationPendingStatus';
import ErrorState from '@/components/ui/error-state';
import useTeacherEvaluationData from '@/hooks/useTeacherEvaluationData';
import useRecitationAmountsPreference from '@/hooks/useRecitationAmountsPreference';
import { useToast } from '@/components/ui/use-toast';
import { studentsApi } from '@/services/studentsApi';
import {
  commitOfflineAttendance,
  commitOfflineRecitation,
  loadCachedTaskData,
  prefetchRecitationTasks,
  syncOfflineRecitations,
  syncCommittedRecitation,
} from '@/services/offlineRecitationService';
import { sortRecitationTasks } from '@/lib/recitationTaskRanges';
import { calculateRecitationScore } from '../../../shared/evaluation-settings.js';
import { calculateGroupRecitationOutcome, countRecitationPayload, isLocalRecitationGroup, mushafRecitationGroup } from '../../../shared/recitation-group-evaluation.js';
import { mergePreparedRecitationTasks, needsRecitationPreparation } from '@/lib/recitationPreparation';
import { preloadMushafFonts } from '@/lib/quranFonts';
import { canMarkRecitationNotCompleted, nazemNotCompletedLabel, countEvaluationItems, hasNazemFixedRange, isNazemLinkTask, isNazemMasteryTask, resolveTaskRecitationMode } from '../../../shared/nazem-recitation-policy.js';

const loadMushafDialog = () => import('@/components/portal/MushafRecitationDialog');
const MushafRecitationDialog = lazy(loadMushafDialog);

const assertSessionAccepted = (session) => {
  if (!session || !['rejected_duplicate', 'rejected_permission', 'conflict', 'failed', 'invalid_sequence'].includes(session.status)) return;
  throw new Error(session.status === 'rejected_duplicate'
    ? 'لم يتم اعتماد هذا التقييم لأن الطالب تم تسميعه مسبقًا في نفس اليوم.'
    : (session.lastError || 'تعذر اعتماد هذا التسميع. بقي محفوظًا على الجهاز.'));
};

const evaluationTypeForTask = (task) => (
  task.taskType === 'memorization' && task.track === 'mastery' ? 'mastery' : task.taskType
);

const offlineOutcome = (task, payload, policies, tasks = [task]) => {
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
  if (payload.groupEvaluation) {
    const groupTasks = tasks.filter(item => payload.groupEvaluation.taskIds.includes(Number(item.id)));
    const expectedFaces = groupTasks.reduce((sum, item) => sum + Number(item.targetPages || 0), 0);
    const actualFaces = groupTasks.some(item => item.reviewGroupMember)
      ? groupTasks.reduce((sum, item) => sum + Number(item.reviewExecution?.faces || 0), 0) : expectedFaces;
    return { ...calculateGroupRecitationOutcome({ policy, taskType: task.taskType, evaluatedFaces: actualFaces, expectedFaces,
      warningCount: payload.groupEvaluation.warningCount, mistakeCount: payload.groupEvaluation.mistakeCount }),
    warningCount, mistakeCount, evaluatedFaces: actualFaces };
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
  const preparationVersion = useRef(0);
  const [isSavingCount, setIsSavingCount] = useState(false);
  const [attendancePendingIds, setAttendancePendingIds] = useState([]);
  const [showAmounts, setShowAmounts] = useRecitationAmountsPreference(supervisorId);
  const [quranChapters, setQuranChapters] = useState([]);
  const shouldLoad = inline || open;
  const onEvaluationLoaded = useCallback((evaluation) => {
    const mushafTasks = (evaluation.taskQueue || evaluation.tasks || []).filter(task => (
      resolveTaskRecitationMode(task, evaluation.evaluationModes?.[evaluationTypeForTask(task)] || 'mushaf') === 'mushaf'
    ));
    if (mushafTasks.length) {
      void loadMushafDialog();
      void preloadMushafFonts(mushafTasks.slice(0, 4).map(task => task.fromPage));
    }
    void prefetchRecitationTasks(supervisorId, mushafTasks, { automatic: true, date: evaluation.generationEndDate || evaluation.date });
  }, [supervisorId]);
  const { data, setData, isLoading, loadError, retryAt, load } = useTeacherEvaluationData(
    supervisorId, shouldLoad, onEvaluationLoaded,
  );

  const toggleAmounts = async () => {
    if (!await setShowAmounts(!showAmounts)) {
      toast({ title: 'تعذر حفظ خيار إظهار المقادير', variant: 'destructive' });
    }
  };

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
    try {
      await commitOfflineAttendance({
        supervisorId,
        studentId,
        date: data?.date,
        status,
      });
      setData((current) => {
        if (!current) return current;
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
    const firstTask = student.tasks?.[0];
    const taskExecutionSource = data?.executionSources?.[firstTask?.taskType] || 'teacher';
    const requiresPreparation = !hasNazemFixedRange(firstTask) && ['teacher', 'both'].includes(taskExecutionSource)
      && needsRecitationPreparation(student);
    if (requiresPreparation && navigator.onLine === false) {
      toast({ title: 'تعذر تعديل المقدار', description: 'اتصل بالإنترنت لتجهيز المقدار الجديد.', variant: 'destructive' });
      return;
    }
    const version = ++preparationVersion.current;
    const selection = { ...student, tasks: student.tasks.map(task => ({ ...task })), preparationVersion: version,
      preparing: requiresPreparation,
      evaluationMode: resolveTaskRecitationMode(firstTask, data?.evaluationModes?.[evaluationTypeForTask(firstTask)] || 'mushaf') };
    setSelectedStudent(selection);
    if (!requiresPreparation) return;
    try {
      const prepared = await studentsApi.prepareSupervisorQuranRange(supervisorId, firstTask.id, {
        actualEnd: student.actualEnd,
        compensation: student.compensation,
        date: data?.date,
        taskIds: (student.tasks || []).map((task) => task.id),
      });
      const preparedTasks = mergePreparedRecitationTasks(student.tasks, prepared, quranChapters);
      const preparedById = new Map(preparedTasks.map(task => [Number(task.id), task]));
      setData(current => current ? { ...current,
        tasks: [...(current.tasks || []).filter(task => !preparedById.has(Number(task.id))), ...preparedTasks],
        taskQueue: [...(current.taskQueue || []).filter(task => !preparedById.has(Number(task.id))), ...preparedTasks],
      } : current);
      setSelectedStudent(current => current?.preparationVersion === version
        ? { ...selection, preparing: false, tasks: sortRecitationTasks(preparedTasks) } : current);
    } catch (error) {
      setSelectedStudent(current => current?.preparationVersion === version ? null : current);
      toast({ title: 'تعذر تعديل مقدار التسميع', description: error.message, variant: 'destructive' });
    }
  };

  const openRecitation = (student) => {
    void prepareRecitation(student);
  };

  const selectedTask = selectedStudent?.tasks?.[0];
  const selectedEvaluationMode = selectedStudent?.evaluationMode || 'mushaf';
  const countItems = useMemo(() => countEvaluationItems(selectedStudent?.tasks), [selectedStudent?.tasks]);

  const markRecitationPending = useCallback((studentId, tasks, session) => {
    if (Number(session.studentId) !== Number(studentId) || !tasks.length) return;
    setData(current => mergeCommittedOfflineEvaluation(current, [session]));
  }, [setData]);

  const syncRecitationInBackground = useCallback((sessionId) => {
    if (navigator.onLine === false) return;
    void syncCommittedRecitation(supervisorId, sessionId)
      .then((savedSession) => {
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

  const finishRecitationSave = useCallback(async (studentId, tasks, session) => {
    // The durable device save is complete; network approval must not hold the dialog open.
    markRecitationPending(studentId, tasks, session);
    syncRecitationInBackground(session.sessionId);
    return { session, results: [], pending: true };
  }, [markRecitationPending, syncRecitationInBackground]);

  const saveCountOnlyRecitation = async ({ itemCounts }) => {
    if (!selectedStudent?.tasks?.length) return;
    setIsSavingCount(true);
    try {
      const taskPayloads = sortRecitationTasks(selectedStudent.tasks).map((task) => {
        const counts = countRecitationPayload(task, selectedStudent.tasks, itemCounts);
        const payload = {
          compensation: selectedStudent.compensation,
          evaluationMode: 'count',
          ...counts,
          ...(isNazemLinkTask(task) ? { expectedNazemLinkCount: task.expectedLinkCount } : {}),
          ...(task.taskType === 'memorization' && selectedStudent.repeatCount !== undefined
            ? { repeatCount: selectedStudent.repeatCount }
            : {}),
          ...(task.taskType === 'memorization' && selectedStudent.listeningCount !== undefined
            ? { listeningCount: selectedStudent.listeningCount }
            : {}),
        };
        return { task, payload: { ...payload, offlineOutcome: offlineOutcome(task, payload, data?.evaluationPolicies, selectedStudent.tasks) } };
      });
      const session = await commitOfflineRecitation({
        supervisorId,
        studentId: selectedStudent.studentId,
        sessionDate: data?.date,
        tasks: taskPayloads,
      });
      await finishRecitationSave(selectedStudent.studentId, selectedStudent.tasks, session);
      setSelectedStudent(null);
    } catch (error) {
      toast({ title: 'تعذر إنهاء التسميع', description: error.message, variant: 'destructive' });
    } finally {
      setIsSavingCount(false);
    }
  };

  const markNotMemorized = async (student) => {
    const memorizationTasks = (student.tasks || []).filter((task) => (
      canMarkRecitationNotCompleted(task)
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
      await finishRecitationSave(student.studentId, memorizationTasks, session);
      setSelectedStudent(null);
    } catch (error) {
      toast({ title: 'تعذر حفظ النتيجة محليًا', description: error.message, variant: 'destructive' });
    } finally { setIsSavingCount(false); }
  };

  const canMarkNotCompleted = selectedStudent?.tasks?.length > 0 && selectedStudent.tasks.every((task) => canMarkRecitationNotCompleted(task));
  const notCompletedAction = canMarkNotCompleted ? (
    <Button type="button" variant="outline" className="min-h-11 [font-family:var(--font-ui)]" disabled={isSavingCount} onClick={() => void markNotMemorized(selectedStudent)}>
      {isNazemMasteryTask(selectedTask) ? 'لم يتقن' : nazemNotCompletedLabel(selectedStudent.tasks[0])}
    </Button>
  ) : null;

  const content = (
    <div className="space-y-3">
      <RecitationPendingStatus receipts={data?.deliveryReceipts} onRetry={async () => {
        try { await syncOfflineRecitations(supervisorId, { force: true }); await load({ fresh: true }); }
        catch (error) { toast({ title: 'تعذر اعتماد التسميع', description: recitationErrorMessage(error), variant: 'destructive' }); }
      }} />
      {loadError && <ErrorState retryAt={retryAt} message={loadError} onRetry={() => void load()} />}
      {(!loadError || Boolean(data?.tasks?.length || data?.students?.length)) && <TeacherRecitationTaskList
        onRefresh={() => void load()}
        tasks={data?.tasks || []}
        taskQueue={data?.taskQueue || []}
        compensationTasks={data?.compensationTasks || []}
        date={data?.generationEndDate || data?.date}
        allowCompensation={Boolean(data?.allowQuranCompensation)}
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
  } else if (selectedStudent.preparing) {
    recitationDialog = <Dialog open onOpenChange={nextOpen => !nextOpen && setSelectedStudent(null)}>
      <DialogContent dir="rtl" className="max-w-sm [font-family:var(--font-ui)]">
        <DialogHeader><DialogTitle>{`تسميع ${selectedStudent.studentName || ''}`}</DialogTitle></DialogHeader>
        <DashboardLoader />
      </DialogContent>
    </Dialog>;
  } else if (selectedEvaluationMode === 'count') {
      recitationDialog = <CountOnlyEvaluationDialog
      secondaryAction={notCompletedAction}
      open={Boolean(selectedStudent)}
      onOpenChange={(nextOpen) => !nextOpen && setSelectedStudent(null)}
      title={`${selectedStudent?.compensation ? 'تعويض' : 'تسميع'} ${selectedStudent?.studentName || ''}`}
      onSubmit={saveCountOnlyRecitation}
      isSaving={isSavingCount}
      supervisorId={supervisorId}
      studentId={selectedStudent?.studentId}
      items={countItems}
      showItemLabels={!isLocalRecitationGroup(selectedTask) && !isNazemLinkTask(selectedTask) && !isNazemMasteryTask(selectedTask)}
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
          tasks: items.map(({ task, payload }) => {
            const groupedPayload = { ...payload, groupEvaluation: mushafRecitationGroup(task, items) };
            return { task, payload: {
              compensation: selectedStudent.compensation,
              ...payload,
              ...groupedPayload,
              offlineOutcome: offlineOutcome(task, groupedPayload, data?.evaluationPolicies, items.map(item => item.task)),
              ...(task.taskType === 'memorization' && selectedStudent?.repeatCount !== undefined
                ? { repeatCount: selectedStudent.repeatCount }
                : {}),
              ...(task.taskType === 'memorization' && selectedStudent?.listeningCount !== undefined
                ? { listeningCount: selectedStudent.listeningCount }
                : {}),
            } };
          }),
        });
        return finishRecitationSave(selectedStudent.studentId, items.map(({ task }) => task), session);
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
            onToggle={toggleAmounts}
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
              onToggle={toggleAmounts}
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
