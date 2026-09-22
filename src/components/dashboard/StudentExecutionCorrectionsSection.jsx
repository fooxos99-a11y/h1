import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import ExecutionCorrectionEndSelector from '@/components/dashboard/ExecutionCorrectionEndSelector';
import RepeatCountSelector from '@/components/portal/RepeatCountSelector';
import { formatContinuousRecitationRange } from '@/lib/recitationTaskRanges';
import { studentsApi } from '@/services/studentsApi';
import { useToast } from '@/components/ui/use-toast';
import { getBusinessDateDaysAgo } from '../../../shared/business-date.js';

const taskLabels = {
  memorization: 'الحفظ',
  mastery: 'الإتقان',
  review: 'المراجعة',
  link: 'الربط',
};

const taskLabel = (task) => (
  task.taskType === 'memorization' && task.track === 'mastery'
    ? taskLabels.mastery
    : taskLabels[task.taskType] || task.taskType
);

const initialForm = (task) => ({
  status: task.status,
  actualEnd: task.actualEnd,
  repeatCount: task.actualRepeatCount || task.expectedRepeatCount || 1,
  listeningCount: task.actualListeningCount || task.expectedListeningCount || 1,
});

const StudentExecutionCorrectionsSection = () => {
  const { toast } = useToast();
  const yesterday = useMemo(() => getBusinessDateDaysAgo(1), []);
  const [students, setStudents] = useState([]);
  const [studentId, setStudentId] = useState('');
  const [date, setDate] = useState(yesterday);
  const [tasks, setTasks] = useState([]);
  const [referenceMode, setReferenceMode] = useState('ayah');
  const [forms, setForms] = useState({});
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [savingKey, setSavingKey] = useState('');

  useEffect(() => {
    let active = true;
    studentsApi.getStudentExecutionCorrectionStudents()
      .then((data) => {
        if (!active) return;
        const nextStudents = Array.isArray(data?.students) ? data.students : [];
        setStudents(nextStudents);
        if (nextStudents.length) setStudentId(String(nextStudents[0].id));
      })
      .catch((error) => {
        if (active) toast({ title: 'تعذر تحميل الطلاب', description: error.message, variant: 'destructive' });
      })
      .finally(() => {
        if (active) setIsLoadingStudents(false);
      });
    return () => {
      active = false;
    };
  }, [toast]);

  const loadTasks = useCallback(async () => {
    if (!studentId || !date) {
      setTasks([]);
      setForms({});
      return;
    }
    setIsLoadingTasks(true);
    try {
      const data = await studentsApi.getStudentExecutionCorrections(studentId, date);
      const nextTasks = Array.isArray(data?.tasks) ? data.tasks : [];
      setReferenceMode(data?.referenceMode === 'page' ? 'page' : 'ayah');
      setTasks(nextTasks);
      setForms(Object.fromEntries(nextTasks.map((task) => [task.key, initialForm(task)])));
    } catch (error) {
      setTasks([]);
      setForms({});
      toast({ title: 'تعذر تحميل التنفيذ', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoadingTasks(false);
    }
  }, [date, studentId, toast]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const updateForm = (key, patch) => {
    setForms((current) => ({
      ...current,
      [key]: { ...current[key], ...patch },
    }));
  };

  const save = async (task) => {
    const form = forms[task.key] || initialForm(task);
    setSavingKey(task.key);
    try {
      const _resolveSave = () => {
        if (form.status === 'done') {
          return {
          actualEnd: form.actualEnd,
          ...(task.taskType === 'memorization' ? {
            repeatCount: form.repeatCount,
            listeningCount: form.listeningCount,
          } : {}),
        };
        }
        return {};
      };
      await studentsApi.saveStudentExecutionCorrection(studentId, {
        taskIds: task.taskIds,
        date,
        status: form.status,
        ...(_resolveSave()),
      });
      toast({ title: 'حُفظ تصحيح التنفيذ' });
      await loadTasks();
    } catch (error) {
      toast({ title: 'تعذر حفظ التصحيح', description: error.message, variant: 'destructive' });
    } finally {
      setSavingKey('');
    }
  };

  if (isLoadingStudents) return <DashboardLoader className="min-h-[420px]" />;

  const _resolveStudentExecutionCorrectionsSection = () => {
    if (isLoadingTasks) {
      return <DashboardLoader className="min-h-48" />;
    }
    if (tasks.length === 0) {
      return <div className="rounded-xl border border-dashed border-primary/20 p-8 text-center text-sm text-muted-foreground">
            لا يوجد تنفيذ لهذا الطالب في التاريخ المحدد.
          </div>;
    }
    return <div className="space-y-3">
            {tasks.map((task) => {
              const form = forms[task.key] || initialForm(task);
              const label = taskLabel(task);
              return (
                <div key={task.key} className="space-y-3 rounded-xl border border-primary/15 bg-background/40 p-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="font-black text-primary">{label}:</span>
                    <span className="min-w-0 text-sm font-bold text-foreground">
                      {formatContinuousRecitationRange(task.rows || [], referenceMode)}
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>حالة التنفيذ</Label>
                      <Select
                        value={form.status}
                        onValueChange={(status) => updateForm(task.key, { status })}
                        disabled={!task.canEdit}
                      >
                        <SelectTrigger aria-label={`حالة تنفيذ ${label}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="done">تم التنفيذ</SelectItem>
                          <SelectItem value="not_done">لم يتم التنفيذ</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {form.status === 'done' && (
                      <div className="space-y-2">
                        <Label>نهاية المقدار المنفذ</Label>
                        <div className="flex min-h-12 items-center rounded-xl border border-primary/20 bg-card px-3">
                          <ExecutionCorrectionEndSelector
                            referenceMode={referenceMode}
                            disabled={!task.canEdit}
                            start={task.start}
                            options={task.options}
                            value={form.actualEnd}
                            onChange={(actualEnd) => updateForm(task.key, { actualEnd })}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {form.status === 'done' && task.taskType === 'memorization' && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <RepeatCountSelector
                        label="التكرار"
                        editable
                        max={task.expectedRepeatCount}
                        value={form.repeatCount}
                        onChange={(repeatCount) => updateForm(task.key, { repeatCount })}
                      />
                      <RepeatCountSelector
                        label="السماع"
                        pluralLabel
                        editable
                        max={task.expectedListeningCount}
                        value={form.listeningCount}
                        onChange={(listeningCount) => updateForm(task.key, { listeningCount })}
                      />
                    </div>
                  )}

                  {task.lockedReason && <p className="text-xs font-bold text-amber-700">{task.lockedReason}</p>}
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      className="min-h-11 min-w-28"
                      disabled={!task.canEdit || savingKey === task.key}
                      onClick={() => save(task)}
                    >
                      {savingKey === task.key ? 'جارٍ الحفظ...' : 'حفظ التصحيح'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>;
  };
  return (
    <Card className="border-primary/30 bg-card [font-family:var(--font-ui)]" dir="rtl">
      <CardHeader className="border-b border-primary/15 p-4">
        <h2 className="text-xl font-black text-primary">تصحيح تنفيذ الطلاب</h2>
      </CardHeader>
      <CardContent className="space-y-4 p-3 sm:p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_8.75rem] items-end gap-2 sm:grid-cols-[minmax(16rem,1fr)_10rem] sm:gap-3">
          <div className="space-y-2">
            <Label>الطالب</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger
                aria-label="الطالب"
                className="h-10 min-w-0 px-2 text-xs sm:h-11 sm:px-3 sm:text-sm [&>span]:truncate"
              >
                <SelectValue placeholder="اختر الطالب" />
              </SelectTrigger>
              <SelectContent>
                {students.map((student) => (
                  <SelectItem key={student.id} value={String(student.id)}>
                    {student.committeeName ? `${student.name} — ${student.committeeName}` : student.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="student-execution-correction-date">التاريخ</Label>
            <Input
              id="student-execution-correction-date"
              type="date"
              max={yesterday}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="h-10 min-w-0 px-2 text-xs sm:h-11 sm:text-sm"
            />
          </div>
        </div>

        {_resolveStudentExecutionCorrectionsSection()}
      </CardContent>
    </Card>
  );
};

export default StudentExecutionCorrectionsSection;
