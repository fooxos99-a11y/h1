import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { DashboardDatePicker } from '@/components/dashboard/DashboardControls';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import { studentsApi } from '@/services/studentsApi';
import { getBusinessDate } from '../../../shared/business-date.js';

const today = getBusinessDate;

const taskTypeLabel = {
  memorization: 'حفظ',
  mastery: 'إتقان',
  repeat: 'تكرار',
  review: 'مراجعة',
  link: 'ربط',
};

const statusOrder = {
  done: 0,
  complete: 0,
  extra: 0,
  partial: 1,
  not_done: 1,
  pending: 2,
};

const taskExecutionStatus = (task) => task?.executionState || task?.studentStatus;

const taskLineClassName = (task) => {
  const status = taskExecutionStatus(task);
  if (status === 'extra') return 'text-sky-600 dark:text-sky-300';
  if (status === 'partial') return 'text-amber-600 dark:text-amber-300';
  if (status === 'not_done' || status === 'pending') return 'text-red-600 dark:text-red-300';
  if (status === 'done' || status === 'complete') return 'text-emerald-600 dark:text-emerald-300';
  return 'text-muted-foreground';
};

const taskSortOrder = {
  memorization: 0,
  repeat: 1,
  review: 2,
  link: 3,
  mastery: 4,
};

const visibleTaskTypes = ['memorization', 'repeat', 'review', 'link', 'mastery'];
const taskDisplayType = (task) => (
  task?.taskType === 'memorization' && task?.track === 'mastery' ? 'mastery' : task?.taskType
);

const mergeTaskGroup = (tasks) => {
  const [first] = tasks;
  if (!first || tasks.length === 1) return first;
  const mergedPreview = tasks
    .map((task) => task.actualPreview || task.preview)
    .filter(Boolean)
    .join(', ');
  const statuses = tasks.map(taskExecutionStatus);
  const executionState = statuses.includes('extra')
    ? 'extra'
    : statuses.includes('partial')
      ? 'partial'
      : first.executionState;
  const studentStatus = tasks.every((task) => task.studentStatus === 'done')
    ? 'done'
    : tasks.some((task) => task.studentStatus === 'not_done')
      ? 'not_done'
      : first.studentStatus;

  return {
    ...first,
    id: tasks.map((task) => task.id).join('-'),
    preview: mergedPreview || first.preview,
    actualPreview: '',
    actualRepeatCount: Math.max(0, ...tasks.map((task) => Number(task.actualRepeatCount || 0))),
    executionState,
    studentStatus,
  };
};

const filterControlClassName = 'h-11 w-full max-w-full min-w-0 rounded-xl border-primary/30 bg-background px-3 text-sm font-semibold text-foreground shadow-none xl:h-10';

const ExecutionFollowupSection = ({ teacherScoped = false }) => {
  const { toast } = useToast();
  const [committees, setCommittees] = useState([]);
  const [filters, setFilters] = useState({
    date: today(),
    committeeId: 'all',
    status: 'all',
  });
  const [data, setData] = useState({ tasks: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [controlsTarget, setControlsTarget] = useState(null);

  useEffect(() => {
    setControlsTarget(document.getElementById('execution-followup-report-controls'));
  }, []);

  const loadExecutionFollowup = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setIsLoading(true);
    try {
      setData(await studentsApi.getExecutionFollowup({
        from: filters.date,
        to: filters.date,
        committeeId: teacherScoped ? 'all' : filters.committeeId,
        status: filters.status,
      }));
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [filters, teacherScoped]);

  useEffect(() => {
    if (teacherScoped) return;
    studentsApi.getCommittees().then(setCommittees).catch((error) => {
      toast({ title: 'تعذر تحميل الحلقات', description: error.message, variant: 'destructive' });
    });
  }, [teacherScoped, toast]);

  useEffect(() => {
    loadExecutionFollowup().catch((error) => {
      toast({ title: 'تعذر تحميل متابعة التنفيذ', description: error.message, variant: 'destructive' });
    });
  }, [loadExecutionFollowup, toast]);

  useEffect(() => {
    const refresh = () => {
      loadExecutionFollowup({ silent: true }).catch((error) => {
        toast({ title: 'تعذر تحديث متابعة التنفيذ', description: error.message, variant: 'destructive' });
      });
    };
    window.addEventListener('madarij-quran-execution-updated', refresh);
    return () => window.removeEventListener('madarij-quran-execution-updated', refresh);
  }, [loadExecutionFollowup, toast]);

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const orderedTasks = useMemo(() => {
    const tasks = data?.tasks || [];
    return [...tasks].sort((first, second) => {
      const statusDiff = (statusOrder[taskExecutionStatus(first)] ?? 9) - (statusOrder[taskExecutionStatus(second)] ?? 9);
      if (statusDiff) return statusDiff;
      const dateDiff = String(second.taskDate || '').localeCompare(String(first.taskDate || ''));
      if (dateDiff) return dateDiff;
      return String(first.studentName || '').localeCompare(String(second.studentName || ''), 'ar');
    });
  }, [data?.tasks]);

  const studentCards = useMemo(() => {
    const cards = new Map();
    orderedTasks.forEach((task) => {
      const key = String(task.studentId || task.studentName || task.id);
      if (!cards.has(key)) {
        cards.set(key, {
          id: key,
          studentName: task.studentName,
          committeeName: task.committeeName,
          statusRank: statusOrder[taskExecutionStatus(task)] ?? 9,
          tasks: [],
        });
      }
      const card = cards.get(key);
      card.statusRank = Math.min(card.statusRank, statusOrder[taskExecutionStatus(task)] ?? 9);
      card.tasks.push(task);
    });
    cards.forEach((card) => {
      const groupedTasks = new Map();
      card.tasks.forEach((task) => {
        const key = `${task.taskDate || ''}:${taskDisplayType(task)}`;
        if (!groupedTasks.has(key)) groupedTasks.set(key, []);
        groupedTasks.get(key).push(task);
      });
      card.tasks = Array.from(groupedTasks.values()).map(mergeTaskGroup);
      card.tasks.sort((first, second) => {
        const typeDiff = (taskSortOrder[taskDisplayType(first)] ?? 9) - (taskSortOrder[taskDisplayType(second)] ?? 9);
        if (typeDiff) return typeDiff;
        return String(first.taskDate || '').localeCompare(String(second.taskDate || ''));
      });
      card.hasNotDone = card.tasks.some((task) => ['not_done', 'pending'].includes(taskExecutionStatus(task)));
      card.hasPartial = card.tasks.some((task) => taskExecutionStatus(task) === 'partial');
    });
    return Array.from(cards.values()).sort((first, second) => {
      if (first.statusRank !== second.statusRank) return first.statusRank - second.statusRank;
      return String(first.studentName || '').localeCompare(String(second.studentName || ''), 'ar');
    });
  }, [orderedTasks]);

  return (
    <>
      {controlsTarget && createPortal(
        <>
            {!teacherScoped && (
              <Select value={filters.committeeId} onValueChange={(value) => updateFilter('committeeId', value)}>
                <SelectTrigger aria-label="الحلقة" className={filterControlClassName}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحلقات</SelectItem>
                  {committees.map((committee) => (
                    <SelectItem key={committee.id} value={String(committee.id)}>{committee.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select value={filters.status} onValueChange={(value) => updateFilter('status', value)}>
              <SelectTrigger aria-label="حالة التنفيذ" className={filterControlClassName}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="done">منفذ</SelectItem>
                <SelectItem value="partial">تنفيذ ناقص</SelectItem>
                <SelectItem value="extra">زيادة خارج الخطة</SelectItem>
                <SelectItem value="not_done">لم ينفذ</SelectItem>
              </SelectContent>
            </Select>

            <div className="min-w-0">
              <DashboardDatePicker
                value={filters.date}
                onChange={(value) => updateFilter('date', value)}
                ariaLabel="التاريخ"
                className="px-2 text-xs sm:px-3 sm:text-sm xl:h-10"
              />
            </div>
        </>,
        controlsTarget,
      )}
      <div className="space-y-4">
          {isLoading ? (
            <DashboardLoader className="py-12" />
          ) : studentCards.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-primary/20 py-12 text-center text-muted-foreground">
              لا توجد مهام تنفيذ ضمن النطاق المحدد.
            </div>
          ) : (
            <div className="grid gap-3">
              {studentCards.map((card) => (
                <article
                  key={card.id}
                  className={`rounded-2xl border p-3 shadow-sm ${
                    card.hasNotDone
                      ? 'border-red-500/35 bg-red-500/10 shadow-red-500/5'
                      : card.hasPartial
                        ? 'border-amber-500/30 bg-amber-500/10 shadow-amber-500/5'
                        : 'border-primary/15 bg-background/80 shadow-primary/5'
                  }`}
                >
                  <div className="mb-3 flex min-w-0 items-baseline gap-2 text-right">
                    <div className="min-w-0 truncate text-base font-black text-foreground">{card.studentName}</div>
                    <div className="min-w-0 truncate text-[10px] font-bold text-muted-foreground sm:text-xs">{card.committeeName || 'بدون حلقة'}</div>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {visibleTaskTypes.map((taskType) => {
                      const task = card.tasks.find((item) => taskDisplayType(item) === taskType);
                      return (
                        <div
                          key={taskType}
                          className={`min-h-9 rounded-lg px-2 py-1.5 text-right text-xs font-black sm:text-sm ${taskLineClassName(task)}`}
                        >
                          <div className="whitespace-normal break-words leading-6">
                            <span>{taskTypeLabel[taskType]}</span>
                            <span className="mx-1 opacity-70">:</span>
                            {!task ? (
                              <span>-</span>
                            ) : taskType === 'repeat' ? (
                              <span>
                                {Math.max(0, Number(task.actualRepeatCount || 0))} مرة، السماع {Number(task.actualListeningCount || 0) > 0 ? 'نعم' : 'لا'}
                              </span>
                            ) : (
                              <span>{task.actualPreview || task.preview || '-'}</span>
                            )}
                            {task?.executionState === 'partial' && <span className="ms-1 text-[11px]">(ناقص)</span>}
                            {task?.executionState === 'extra' && !task?.nazemManaged && <span className="ms-1 text-[11px]">(زيادة خارج الخطة)</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          )}
      </div>
    </>
  );
};

export default ExecutionFollowupSection;
