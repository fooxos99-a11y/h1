import { isStudentAmountHidden } from '../../../shared/student-amount-visibility.js';
import { cleanQuranPreview as cleanPreview } from '../../../shared/quran-display-text.js';
import { getRecitationStatusLabel } from '@/lib/recitationEvaluation';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import QuranExecutionBreakdown from '@/components/portal/QuranExecutionBreakdown';
import RepeatCountSelector from '@/components/portal/RepeatCountSelector';
import { useToast } from '@/components/ui/use-toast';
import { studentsApi } from '@/services/studentsApi';
import {
  canStudentSetQuranTaskEnd,
  compareQuranPositionInDirection,
} from '../../../shared/quran-execution-policy.js';

const typeLabels = {
  memorization: 'حفظ',
  review: 'مراجعة',
  link: 'ربط',
};

const taskOrder = ['memorization', 'review', 'link'];
const emptyTaskLabels = {
  memorization: 'لايوجد حفظ وتكرار',
  review: 'لايوجد مراجعة',
  link: 'لايوجد ربط',
};

const formatTaskAmount = (task = {}) => {
  if (cleanPreview(task.preview)) return cleanPreview(task.preview);
  const fromSurahName = task.fromSurahName || '';
  const toSurahName = task.toSurahName || fromSurahName;
  const hasRange = fromSurahName && task.fromAyah && task.toAyah;
  if (hasRange) {
    if (String(task.fromSurah) === String(task.toSurah)) {
      return `${fromSurahName} آية ${task.fromAyah} إلى آية ${task.toAyah}`;
    }
    return `${fromSurahName} آية ${task.fromAyah} إلى ${toSurahName} آية ${task.toAyah}`;
  }
  return '';
};

const positionKey = (position = {}) => [position.page, position.surah, position.ayah].map((value) => Number(value || 0)).join(':');

const comparePosition = (first = {}, second = {}) => {
  const pageDiff = Number(first.page || 0) - Number(second.page || 0);
  if (pageDiff) return pageDiff;
  const surahDiff = Number(first.surah || 0) - Number(second.surah || 0);
  if (surahDiff) return surahDiff;
  return Number(first.ayah || 0) - Number(second.ayah || 0);
};

const inlineSelectTriggerClass = 'inline-flex h-auto !min-h-[44px] w-auto !min-w-[44px] border-0 !bg-transparent p-0 text-xs font-black text-primary !shadow-none ring-0 hover:text-primary/80 focus:ring-0 focus:ring-offset-0 [&>span]:flex-none [&>svg]:hidden';
const inlinePageSelectContentClass = 'z-[140] !w-16 !min-w-16 max-h-56 border-primary/25 bg-background/95 text-xs font-black shadow-xl shadow-primary/10 backdrop-blur';
const inlineTextSelectContentClass = 'z-[140] !w-auto !min-w-24 max-h-56 border-primary/25 bg-background/95 text-xs font-black shadow-xl shadow-primary/10 backdrop-blur';
const inlineSelectItemClass = '!min-h-[44px] justify-center px-2 text-center text-xs font-black data-[state=checked]:bg-primary/15 data-[state=checked]:text-primary [&>span:last-child]:text-center';

const taskStart = (task = {}) => ({ page: task.fromPage, surah: task.fromSurah, ayah: task.fromAyah, surahName: task.fromSurahName });
const taskEnd = (task = {}) => ({ page: task.toPage, surah: task.toSurah, ayah: task.toAyah, surahName: task.toSurahName });
const taskActualEnd = (task = {}) => (
  task.actualToPage && task.actualToSurah && task.actualToAyah
    ? { page: task.actualToPage, surah: task.actualToSurah, ayah: task.actualToAyah, surahName: task.actualToSurahName || task.toSurahName }
    : taskEnd(task)
);

const groupState = (tasks = []) => {
  if (tasks.some((task) => task.executionState === 'extra')) return 'extra';
  if (tasks.some((task) => task.executionState === 'partial')) return 'partial';
  if (tasks.length > 0 && tasks.every((task) => task.studentStatus === 'done')) return 'done';
  if (tasks.some((task) => task.studentStatus === 'not_done')) return 'not_done';
  return null;
};

const QuranExecutionContent = ({ studentId, open = false, onOpenChange, inline = false, embedded = false, compact = false, onReady }) => {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [savingTypes, setSavingTypes] = useState({});
  const [endSelection, setEndSelection] = useState({ context: '', keys: {} });
  const requestSequence = useRef(0);
  const [actualRepeatCounts, setActualRepeatCounts] = useState({});
  const [actualListeningCounts, setActualListeningCounts] = useState({});
  const shouldLoad = inline || open;

  const load = useCallback(async (silent = false) => {
    if (!shouldLoad || !studentId) return;
    const request = ++requestSequence.current;
    if (!silent) setIsLoading(true);
    try {
      const result = await studentsApi.getStudentQuranToday(studentId);
      if (request === requestSequence.current) {
        setData(result);
        return result;
      }
    } catch (error) {
      if (request !== requestSequence.current) return;
      if (!silent) setData(null);
      toast({ title: 'تعذر تحميل التنفيذ', description: error.message, variant: 'destructive' });
    } finally {
      if (request === requestSequence.current) { setIsLoading(false); onReady?.(true); }
    }
  }, [shouldLoad, studentId, toast, onReady]);

  useEffect(() => {
    load();
    return () => { requestSequence.current += 1; };
  }, [load]);

  const selectionContext = JSON.stringify([studentId, data?.date, data?.plan?.id,
    data?.plan?.dailyPages, data?.plan?.progress, data?.executionLimits, data?.tasks]);
  const selectedEndKeys = endSelection.context === selectionContext ? endSelection.keys : {};

  const getGroupBounds = (tasks = []) => {
    const followsPlanDirection = ['memorization', 'repeat'].includes(tasks[0]?.taskType);
    const planDirection = (
      Number(data?.plan?.startSurah) > Number(data?.plan?.endSurah)
      || (
        Number(data?.plan?.startSurah) === Number(data?.plan?.endSurah)
        && Number(data?.plan?.startAyah) > Number(data?.plan?.endAyah)
      )
    ) ? -1 : 1;
    const taskDirection = tasks[0] && comparePosition(taskStart(tasks[0]), taskEnd(tasks[0])) > 0 ? -1 : 1;
    const direction = followsPlanDirection ? planDirection : taskDirection;
    const sorted = [...tasks].sort((first, second) => compareQuranPositionInDirection(taskStart(first), taskStart(second), direction));
    const start = sorted[0] ? taskStart(sorted[0]) : null;
    const _resolveExpectedEnd = () => {
      if (tasks[0]?.taskType === 'memorization' && !data?.nazemManaged) {
        return sorted[0]?.normalEnd || data?.plan?.progress?.normalEnd || (sorted.length ? taskEnd(sorted.at(-1)) : null);
      }
      if (sorted.length) {
        return taskEnd(sorted.at(-1));
      }
      return null;
    };
    const expectedEnd = _resolveExpectedEnd();
    return { sorted, start, expectedEnd, direction };
  };

  const getEndOptions = (group) => {
    const { start, expectedEnd, direction } = getGroupBounds(group?.tasks || []);
    if (!start) return [];
    const allowedEnd = data?.executionLimits?.[group?.type]
      || (['review', 'link'].includes(group?.type) ? expectedEnd : null);
    return (data?.executionAyahs || [])
      .filter((ayah) => compareQuranPositionInDirection(ayah, start, direction) >= 0
        && (!allowedEnd || compareQuranPositionInDirection(ayah, allowedEnd, direction) <= 0)
        && canStudentSetQuranTaskEnd(
          data,
          group?.type,
          compareQuranPositionInDirection(ayah, expectedEnd, direction),
        ))
      .sort((first, second) => compareQuranPositionInDirection(first, second, direction))
      .map((ayah) => ({ ...ayah, key: positionKey(ayah) }));
  };

  const getCurrentEnd = (group) => {
    const { direction } = getGroupBounds(group.tasks);
    const currentEnd = group.tasks
      .filter((task) => task.studentStatus === 'done' && task.actualToPage)
      .map(taskActualEnd)
      .sort((first, second) => compareQuranPositionInDirection(first, second, direction))
      .pop() || getGroupBounds(group.tasks).expectedEnd;
    return currentEnd;
  };

  const getSelectedEndKey = (group) => {
    if (!group?.tasks?.length) return '';
    const options = getEndOptions(group);
    const expectedKey = positionKey(getGroupBounds(group.tasks).expectedEnd);
    const currentKey = positionKey(getCurrentEnd(group));
    const selectedKey = selectedEndKeys[group.type] || currentKey;
    if (options.some((option) => option.key === selectedKey)) return selectedKey;
    return options.some((option) => option.key === currentKey) ? currentKey : expectedKey;
  };

  const setSelectedEndKey = (type, key) => {
    setEndSelection((current) => ({
      context: selectionContext,
      keys: { ...(current.context === selectionContext ? current.keys : {}), [type]: key },
    }));
  };

  const getSelectedEnd = (group) => {
    if (isStudentAmountHidden(data, group.type) || group.type === 'repeat') return null;
    if (['done', 'partial', 'extra'].includes(group.status)) return getCurrentEnd(group);
    const expectedEnd = getGroupBounds(group.tasks).expectedEnd;
    const options = getEndOptions(group);
    const canAdjust = options.some((option) => positionKey(option) !== positionKey(expectedEnd));
    if (!canAdjust) return expectedEnd;
    const key = getSelectedEndKey(group);
    return options.find((option) => option.key === key) || expectedEnd;
  };

  const updateTasks = async (group, status, actualEnd = null) => {
    const type = group.type;
    const taskIds = group.tasks.map((task) => task.id);
    if (!taskIds.length || savingTypes[type]) return;
    setSavingTypes((current) => ({ ...current, [type]: true }));
    try {
      await studentsApi.updateStudentQuranTasksExecution(studentId, {
        taskIds,
        status,
        actualEnd,
        repeatCount: type === 'memorization'
          ? Number(actualRepeatCounts.memorization ?? data?.repeatCount ?? 1)
          : undefined,
        listeningCount: type === 'memorization' && data?.listeningEnabled
          ? Number(actualListeningCounts.memorization ?? data?.listeningCount ?? 3)
          : undefined,
      });
      const today = await load(true);
      window.dispatchEvent(new CustomEvent('madarij-quran-execution-updated', {
        detail: { studentId, taskIds, taskType: type, today },
      }));
    } catch (error) {
      toast({ title: 'تعذر حفظ التنفيذ', description: error.message, variant: 'destructive' });
    } finally {
      setSavingTypes((current) => ({ ...current, [type]: false }));
    }
  };

  const taskGroups = taskOrder
    .filter((type) => {
      const source = data?.executionSources?.[type];
      return !source || source === 'student' || source === 'both';
    })
    .map((type) => {
    const tasks = (data?.tasks || []).filter((task) => task.taskType === type);
    const trackLabel = tasks[0]?.trackLabel || data?.plan?.trackLabel || (data?.plan?.track === 'mastery' ? 'إتقان' : 'حفظ');
    const _resolveLabel = () => {
      if (type === 'memorization') {
        return trackLabel;
      }
      if (type === 'repeat') {
        return `التكرار${data?.listeningEnabled ? ' والسماع' : ''}`;
      }
      return typeLabels[type];
    };
    return {
      type,
      tasks,
      label: _resolveLabel(),
      preview: tasks.map(formatTaskAmount).filter(Boolean).join('، '),
      actualPreview: tasks
        .filter((task) => task.studentStatus === 'done' && task.actualPreview)
        .map((task) => task.actualPreview)
        .filter(Boolean)
        .join('، '),
      status: groupState(tasks),
      needsRepeat: tasks.some((task) => getRecitationStatusLabel(task) === 'يحتاج إعادة'),
    };
    });

  const renderEndSelector = (group) => {
    if (isStudentAmountHidden(data, group.type)) return null;
    if (!group.tasks.length) {
      return <div className="mt-1 text-xs font-bold text-muted-foreground">{emptyTaskLabels[group.type]}</div>;
    }
    if (['done', 'partial', 'extra'].includes(group.status)) {
      return group.type === 'memorization' && !data?.nazemManaged ? null
        : <div className="mt-1 text-xs font-bold text-muted-foreground">{group.actualPreview || group.preview}</div>;
    }
    if (group.type === 'repeat') return <div className="mt-1 text-xs font-bold text-muted-foreground">{group.preview}</div>;
    const options = getEndOptions(group);
    const selectedEnd = getSelectedEnd(group);
    const start = getGroupBounds(group.tasks).start;
    const expectedEnd = getGroupBounds(group.tasks).expectedEnd;
    const canAdjust = options.some((option) => positionKey(option) !== positionKey(expectedEnd));
    const isAyahDisplay = String(group.preview || '').includes('آية');
    if (!canAdjust || !selectedEnd) {
      return <div className="mt-1 text-xs font-bold text-muted-foreground">{group.actualPreview || group.preview}</div>;
    }

    if (!isAyahDisplay) {
      const pages = [...new Set(options.map((option) => Number(option.page)).filter(Boolean))];
      const selectPage = (page) => {
        const pageOptions = options.filter((option) => Number(option.page) === Number(page));
        setSelectedEndKey(group.type, pageOptions.at(-1)?.key || getSelectedEndKey(group));
      };
      return (
        <div className="mt-2 flex flex-wrap items-center justify-start gap-2 text-xs font-black text-muted-foreground">
          <span>من {start?.page}</span>
          <span>إلى</span>
          <Select value={String(selectedEnd.page)} onValueChange={selectPage}>
            <SelectTrigger aria-label="صفحة النهاية" appearance="inline" className={inlineSelectTriggerClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="center" sideOffset={2} className={inlinePageSelectContentClass}>
              {pages.map((page) => (
                <SelectItem key={page} value={String(page)} showIndicator={false} className={inlineSelectItemClass}>{page}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    const surahs = [...new Map(options.map((option) => [String(option.surah), option])).values()];
    const ayahs = options.filter((option) => Number(option.surah) === Number(selectedEnd.surah));
    const selectSurah = (surah) => {
      const sameSurah = options.filter((option) => Number(option.surah) === Number(surah));
      const keepAyah = sameSurah.find((option) => Number(option.ayah) === Number(selectedEnd.ayah));
      setSelectedEndKey(group.type, (keepAyah || sameSurah[0])?.key || getSelectedEndKey(group));
    };

    return (
      <div className="mt-2 flex flex-wrap items-center justify-start gap-2 text-xs font-black text-muted-foreground">
        <span>من {start?.surahName || `سورة ${start?.surah}`} آية {start?.ayah}</span>
        <span>إلى</span>
        <Select value={String(selectedEnd.surah)} onValueChange={selectSurah}>
          <SelectTrigger aria-label="سورة النهاية" appearance="inline" className={inlineSelectTriggerClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="center" sideOffset={2} className={inlineTextSelectContentClass}>
            {surahs.map((option) => (
              <SelectItem key={option.surah} value={String(option.surah)} showIndicator={false} className={inlineSelectItemClass}>{option.surahName || `سورة ${option.surah}`}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(selectedEnd.ayah)} onValueChange={(ayah) => {
          const option = ayahs.find((item) => Number(item.ayah) === Number(ayah));
          if (option) setSelectedEndKey(group.type, option.key);
        }}>
          <SelectTrigger aria-label="آية النهاية" appearance="inline" className={inlineSelectTriggerClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="center" sideOffset={2} className={inlinePageSelectContentClass}>
            {ayahs.map((option) => (
              <SelectItem key={option.key} value={String(option.ayah)} showIndicator={false} className={inlineSelectItemClass}>{option.ayah}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  };

  const _resolveContent = () => {
    if (isLoading && !data) {
      return <DashboardLoader />;
    }
    if (!data?.plan) {
      return <div className="rounded-xl border border-dashed border-primary/20 p-8 text-center text-muted-foreground">لا توجد خطة حالية.</div>;
    }
    if (data.isHoliday) {
      return <div className="rounded-xl border border-primary/15 bg-primary/5 p-5 text-center font-bold">اليوم إجازة أسبوعية.</div>;
    }
    return <div className="space-y-3">
      {taskGroups.map((group) => (
        <div key={group.type} className="grid gap-3 rounded-xl border border-primary/15 bg-background/70 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div>
            <div className="font-black text-foreground">{group.label}</div>
            {group.needsRepeat && (
              <div className="mt-1 inline-flex rounded-full bg-red-500/10 px-2.5 py-1 text-[11px] font-black text-red-600 dark:text-red-300">يحتاج إعادة</div>
            )}
            {group.type === 'memorization' && group.tasks.length > 0 && !isStudentAmountHidden(data, group.type) && !data?.nazemManaged && (
              <QuranExecutionBreakdown
                bounds={getGroupBounds(group.tasks)}
                scheduledEnd={getGroupBounds(group.tasks).sorted[0]?.scheduledEnd || data?.plan?.progress?.scheduledEnd}
                actualEnd={getSelectedEnd(group)}
                ayahs={data?.executionAyahs || []}
                recorded={['done', 'partial', 'extra'].includes(group.status)}
                ayahDisplay={String(group.preview || '').includes('آية')}
              />
            )}
            {renderEndSelector(group)}
            {group.type === 'memorization' && group.tasks.length > 0 && (
              <div className="me-auto mt-3 w-full max-w-xs space-y-1 text-right" dir="rtl">
                <RepeatCountSelector
                  editable={Boolean(data?.allowRepeatCountEditing)}
                  max={Math.max(1, Number(data?.repeatCount || 1))}
                  value={actualRepeatCounts.memorization ?? Math.max(1, Number(data?.repeatCount || 1))}
                  onChange={(value) => setActualRepeatCounts((current) => ({
                    ...current,
                    memorization: value,
                  }))}
                />
                {data?.listeningEnabled && (
                  <RepeatCountSelector
                    label="السماع"
                    pluralLabel
                    editable={Boolean(data?.allowListeningCountEditing)}
                    max={Math.max(1, Number(data?.listeningCount || 3))}
                    value={actualListeningCounts.memorization ?? Math.max(1, Number(data?.listeningCount || 3))}
                    onChange={(value) => setActualListeningCounts((current) => ({
                      ...current,
                      memorization: value,
                    }))}
                  />
                )}
              </div>
            )}
            {group.status === 'partial' && (
              <div className="mt-1 text-[11px] font-black text-amber-600 dark:text-amber-300">تنفيذ ناقص</div>
            )}
          </div>
          {group.tasks.length > 0 && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={['done', 'partial', 'extra'].includes(group.status) ? 'default' : 'outline'}
                className={['done', 'partial', 'extra'].includes(group.status)
                  ? 'min-h-11 bg-amber-500 text-slate-950 hover:bg-amber-500/90'
                  : 'min-h-11 border-2 border-amber-500 bg-transparent text-amber-600 hover:bg-amber-500/10 dark:text-amber-300'}
                aria-pressed={['done', 'partial', 'extra'].includes(group.status)}
                disabled={Boolean(savingTypes[group.type])}
                onClick={() => {
                  const executed = ['done', 'partial', 'extra'].includes(group.status);
                  updateTasks(group, executed ? 'not_done' : 'done', executed ? null : getSelectedEnd(group));
                }}
              >
                {['done', 'partial', 'extra'].includes(group.status) && <CheckCircle2 className="h-4 w-4" />}
                {['done', 'partial', 'extra'].includes(group.status) ? 'تم التنفيذ' : 'تنفيذ'}
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>;
  };
  const content = _resolveContent();

  if (inline && compact) {
    if (!data) return isLoading ? <DashboardLoader /> : <Button variant="outline" onClick={() => load()}>إعادة المحاولة</Button>;
    return <div className="student-home-task-grid">{taskGroups.filter((group) => group.type !== 'repeat' && group.tasks.length).map((group) => {
      const completed = ['done', 'partial', 'extra'].includes(group.status);
      return <div key={group.type} className="student-home-execution-task"><Button variant="ghost" className="student-home-task" aria-pressed={completed} aria-busy={Boolean(savingTypes[group.type])} disabled={isLoading || Boolean(savingTypes[group.type])} onClick={() => updateTasks(group, completed ? 'not_done' : 'done', completed ? null : getSelectedEnd(group))}><span>{group.label}{completed && <CheckCircle2 size={15} />}</span></Button><div className="student-home-execution-amount">{renderEndSelector(group)}</div></div>;
    })}</div>;
  }

  if (inline && embedded) {
    return <section className="[font-family:var(--font-ui)]" dir="rtl" aria-label="التنفيذ"><h2 className="mb-4 text-lg font-black text-primary">التنفيذ</h2>{content}</section>;
  }

  if (inline) {
    return (
      <Card className="border-primary/30 bg-card neon-glow [font-family:var(--font-ui)]" dir="rtl">
        <CardHeader className="border-b border-primary/15 p-4">
          <h2 className="text-xl font-black text-primary neon-text">التنفيذ</h2>
        </CardHeader>
        <CardContent className="p-4">{content}</CardContent>
      </Card>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[51] max-h-[90dvh] max-w-2xl overflow-y-auto border-primary/30 bg-card p-4 text-foreground [font-family:var(--font-ui)] sm:p-6" dir="rtl">
        <DialogHeader className="border-b border-primary/15 pb-4 text-right">
          <DialogTitle className="text-xl font-black text-primary neon-text">التنفيذ</DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
};

const QuranExecutionDialog = (props) => <QuranExecutionContent key={props.studentId} {...props} />;

export default QuranExecutionDialog;
