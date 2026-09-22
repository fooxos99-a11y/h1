import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, RotateCcw, UserCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import ErrorState from '@/components/ui/error-state';
import NazemConflictCard from '@/components/dashboard/NazemConflictCard';
import NazemPlanRefreshSummary from '@/components/dashboard/NazemPlanRefreshSummary';
import { nazemIntegrationApi } from '@/services/nazemIntegrationApi';
import { useToast } from '@/components/ui/use-toast';

const circleKey = (candidate) => `${candidate.circleName || 'بدون حلقة'}|${candidate.organizationName || ''}`;
const importablePlans = (candidate) => candidate.plans.filter((plan) => (
  ['discovered', 'requires_review'].includes(plan.status)
));
const isActionableCandidate = (candidate) => (
  !candidate.linkedStudentId
  || importablePlans(candidate).length > 0
  || candidate.plans.some((plan) => Boolean(plan.lastError))
);
const planStateLabel = (candidate, availablePlans, failed) => {
  if (availablePlans.some((plan) => plan.changeType === 'changed')) return 'تغيّرت خطة ناظم';
  if (availablePlans.some((plan) => plan.changeType === 'new')) return 'توجد خطة جديدة في ناظم';
  if (availablePlans.length) return 'خطة ناظم جاهزة للاستيراد';
  if (candidate.plans.length) return 'الخطة مرتبطة سابقًا';
  return failed ? 'تعذر التحقق من الخطة' : 'لم تُكتشف خطة';
};
const buildSelections = (candidates, localStudents) => { return (Object.fromEntries(candidates.map((candidate) => {
  const suggested = localStudents.find((student) => Number(student.id) === Number(candidate.suggestedStudentId));
  const requiresConfirmation = !candidate.linkedStudentId && Boolean(suggested);
  const availablePlans = importablePlans(candidate);
  const _resolveAction = () => {
    if (candidate.linkedStudentId) {
      return 'keep';
    }
    if (suggested) {
      return 'match';
    }
    return 'create';
  };
  return [candidate.id, {
    action: _resolveAction(),
    studentId: suggested ? String(suggested.id) : '',
    importPlan: availablePlans.length === 1,
    planCandidateId: availablePlans.length === 1 ? String(availablePlans[0].id) : '',
    requiresPlanChoice: availablePlans.length > 1,
    requiresConfirmation,
    confirmed: !requiresConfirmation,
  }];
}))); };

const NazemStudentPlanImportDialog = ({ open, teacher, onOpenChange, onChanged }) => {
  const { toast } = useToast();
  const prepared = teacher?.preparedImport;
  const preparedCircle = prepared?.preview?.candidates?.[0];
  const [data, setData] = useState(prepared?.preview || null);
  const [mode, setMode] = useState(prepared?.mode || 'new');
  const [committeeId, setCommitteeId] = useState(prepared?.committeeId || '');
  const [newCommitteeName, setNewCommitteeName] = useState(prepared?.newCommitteeName || '');
  const [selectedCircle, setSelectedCircle] = useState(preparedCircle ? circleKey(preparedCircle) : '');
  const [selections, setSelections] = useState(() => buildSelections(
    prepared?.preview?.candidates || [],
    prepared?.preview?.localStudents || [],
  ));
  const [conflicts, setConflicts] = useState(prepared?.conflicts || []);
  const [hiddenConflictIds, setHiddenConflictIds] = useState([]);
  const [excludedCandidateIds, setExcludedCandidateIds] = useState([]);
  const toggleCandidate = (candidateId) => setExcludedCandidateIds((current) => (
    current.includes(candidateId) ? current.filter((id) => id !== candidateId) : [...current, candidateId]
  ));
  const hideConflict = (conflictId) => setHiddenConflictIds((current) => [...current, conflictId]);
  const [busyConflictId, setBusyConflictId] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [refreshResult, setRefreshResult] = useState(prepared?.refreshResult || null);
  const requestRef = useRef(null);

  const applyPreview = useCallback((preview, preferredCircle = '') => {
    const circles = [...new Set(preview.candidates.filter(isActionableCandidate).map(circleKey))];
    const nextCircle = circles.includes(preferredCircle) ? preferredCircle : circles[0] || '';
    setData(preview);
    setSelectedCircle(nextCircle);
    setSelections(buildSelections(preview.candidates, preview.localStudents));
    setExcludedCandidateIds([]);
    return nextCircle;
  }, []);

  const load = useCallback(async ({ refresh = false } = {}) => {
    if (!teacher?.teacherId) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const { signal } = controller;
    try {
      setLoadError('');
      setData(null);
      setResult(null);
      if (refresh && await refreshImportPreview({ teacher, signal, applyPreview, setMode, setCommitteeId, setNewCommitteeName, setConflicts, setRefreshResult, setLoadError })) return;
      const [initial, conflictRows] = await Promise.all([
        nazemIntegrationApi.getImportPreview(teacher.teacherId, '', { signal }),
        nazemIntegrationApi.getConflicts(teacher.teacherId, { signal }),
      ]);
      if (signal.aborted) return;
      setConflicts(conflictRows.filter((row) => row.entityType === 'plan'));
      setHiddenConflictIds([]);
      const initialCircle = applyPreview(initial);
      const recommendedId = initial.recommendedCommitteeId;
      if (recommendedId) {
        setMode('existing');
        setCommitteeId(String(recommendedId));
        const selected = await nazemIntegrationApi.getImportPreview(teacher.teacherId, recommendedId, { signal });
        if (signal.aborted) return;
        applyPreview(selected, initialCircle);
      } else {
        setMode('new');
        setCommitteeId('');
        const firstCircle = initial.candidates.find((candidate) => circleKey(candidate) === initialCircle);
        setNewCommitteeName(firstCircle?.circleName || initial.suggestedNewCommitteeName || '');
      }
    } catch (error) {
      if (!signal.aborted) setLoadError(error.message || 'تعذر تحميل طلاب ناظم.');
    }
  }, [applyPreview, teacher?.teacherId]);

  useEffect(() => {
    if (open && !prepared?.preview) void load({ refresh: true });
    return () => requestRef.current?.abort();
  }, [load, open, prepared?.preview]);

  useEffect(() => {
    if (!prepared?.preview) return;
    const nextCircle = applyPreview(prepared.preview);
    setMode(prepared.mode || 'new');
    setCommitteeId(prepared.committeeId || '');
    setNewCommitteeName(prepared.newCommitteeName || prepared.preview.suggestedNewCommitteeName || '');
    if (nextCircle) setSelectedCircle(nextCircle);
  }, [applyPreview, prepared]);

  const circles = useMemo(() => (
    data ? [...new Map(data.candidates.filter(isActionableCandidate).map((candidate) => [circleKey(candidate), {
      key: circleKey(candidate),
      name: candidate.circleName || 'بدون حلقة',
      organization: candidate.organizationName || '',
    }])).values()] : []
  ), [data]);
  const visibleCandidates = useMemo(() => (
    data?.candidates.filter((candidate) => (
      isActionableCandidate(candidate) && circleKey(candidate) === selectedCircle
    )) || []
  ), [data, selectedCircle]);
  const includedCandidates = useMemo(() => (
    visibleCandidates.filter((candidate) => !excludedCandidateIds.includes(candidate.id))
  ), [excludedCandidateIds, visibleCandidates]);

  const chooseCommittee = async (value) => {
    if (value === 'new') {
      setMode('new');
      setCommitteeId('');
      const candidate = data?.candidates.find((item) => circleKey(item) === selectedCircle);
      setNewCommitteeName(candidate?.circleName || data?.suggestedNewCommitteeName || 'حلقة ناظم');
      setSelections(buildSelections(data?.candidates || [], []));
      return;
    }
    setMode('existing');
    setCommitteeId(value);
    if (!value) return;
    try {
      setLoadError('');
      const preview = await nazemIntegrationApi.getImportPreview(teacher.teacherId, value);
      applyPreview(preview, selectedCircle);
    } catch (error) {
      setLoadError(error.message || 'تعذر تحميل طلاب الحلقة.');
    }
  };

  const changeCircle = (value) => {
    setSelectedCircle(value);
    if (mode === 'new') {
      const candidate = data?.candidates.find((item) => circleKey(item) === value);
      setNewCommitteeName(candidate?.circleName || '');
    }
  };

  const updateSelection = (candidateId, patch) => {
    setSelections((current) => ({
      ...current,
      [candidateId]: { ...current[candidateId], ...patch },
    }));
  };

  const resolveConflict = async (conflictId, resolution) => {
    try {
      setBusyConflictId(conflictId);
      await nazemIntegrationApi.resolveConflict(conflictId, resolution);
      await load();
      onChanged?.();
      toast({ title: resolution === 'use_ruwasi' ? 'اعتمدت خطة المنصة' : 'اعتمدت خطة ناظم' });
    } catch (error) {
      toast({ title: 'تعذر حل تعارض الخطة', description: error.message, variant: 'destructive' });
    } finally {
      setBusyConflictId(null);
    }
  };

  const submit = async () => {
    const submittedCandidates = includedCandidates.filter((candidate) => importablePlans(candidate).length > 0);
    const needsConfirmation = submittedCandidates.some((candidate) => (
      selections[candidate.id]?.requiresConfirmation && !selections[candidate.id]?.confirmed
    ));
    if (needsConfirmation) {
      toast({ title: 'أكد مطابقة الطلاب المقترحين أولًا', variant: 'destructive' });
      return;
    }
    const payloadSelections = submittedCandidates.map((candidate) => {
      const selection = selections[candidate.id] || { action: 'create', importPlan: false };
      return {
        candidateId: candidate.id,
        action: selection.action,
        studentId: Number(selection.studentId || 0) || null,
        importPlan: selection.importPlan === true,
        planCandidateId: Number(selection.planCandidateId || 0) || null,
      };
    });
    if (mode === 'existing' && !committeeId) {
      toast({ title: 'اختر حلقة مدارج أولًا', variant: 'destructive' });
      return;
    }
    if (mode === 'new' && newCommitteeName.trim().length < 2) {
      toast({ title: 'اكتب اسم الحلقة الجديدة', variant: 'destructive' });
      return;
    }
    try {
      setSaving(true);
      const nextResult = await nazemIntegrationApi.importStudentsAndPlans(teacher.teacherId, {
        importMode: 'with_plans',
        committeeId: mode === 'existing' ? Number(committeeId) : null,
        newCommitteeName: mode === 'new' ? newCommitteeName.trim() : '',
        selections: payloadSelections,
      });
      setResult(nextResult);
      onChanged?.();
      toast({ title: 'اكتمل استيراد طلاب ناظم' });
    } catch (error) {
      toast({ title: 'تعذر الاستيراد', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const candidatesWithPlans = includedCandidates.filter((candidate) => importablePlans(candidate).length > 0);
  const hasBlockingSelection = (candidates) => candidates.some((candidate) => (
    (selections[candidate.id]?.requiresConfirmation && !selections[candidate.id]?.confirmed)
    || selections[candidate.id]?.requiresPlanChoice
  ));

  const _resolveNazemStudentPlanImportDialog = () => {
    if (loadError && !data) {
      return <div className="space-y-4">
        <ErrorState message={loadError} onRetry={() => load({ refresh: true })} />
        <DialogFooter><Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>إلغاء</Button></DialogFooter>
      </div>;
    }
    if (!data) {
      return <div className="space-y-4">
        <DashboardLoader />
        <DialogFooter><Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>إلغاء</Button></DialogFooter>
      </div>;
    }
    if (result) {
      return <div className="space-y-4">
        <NazemPlanRefreshSummary result={refreshResult} />
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-700">
          أضيف {result.created}، وربط {result.matched}، والموجود سابقًا {result.kept}، واستورد {result.plansImported} خطة.
          {result.plansReview > 0 && ` بقيت ${result.plansReview} خطة للمراجعة.`}
        </div>
        {result.createdStudents?.length > 0 && (
          <div className="space-y-2">
            <div className="font-black text-foreground">أرقام دخول الطلاب الجدد</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {result.createdStudents.map((student) => (
                <div key={student.id} className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-primary/15 px-3">
                  <span className="font-bold">{student.name}</span><span className="font-black text-primary" dir="ltr">{student.loginNumber}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {result.reviewItems?.length > 0 && (
          <div className="space-y-2 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm">
            {result.reviewItems.map((item, index) => <div key={`${item.name}-${index}`}><strong>{item.name}:</strong> {item.reason}</div>)}
          </div>
        )}
        <DialogFooter><Button type="button" className="min-h-11" onClick={() => onOpenChange(false)}>إغلاق</Button></DialogFooter>
      </div>;
    }
    if (visibleCandidates.length === 0) {
      return <div className="space-y-4">
        <NazemPlanRefreshSummary result={refreshResult} />
        <div className="rounded-xl border border-primary/15 bg-muted/30 p-4 text-sm font-bold text-muted-foreground">
          {data.candidates.length ? 'كل الطلاب والخطط المستوردة مرتبطة مسبقًا.' : 'لم يُكتشف أي طالب في حساب ناظم.'}
        </div>
        <DialogFooter><Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>إلغاء</Button></DialogFooter>
      </div>;
    }
    return <div className="space-y-4">
      <NazemPlanRefreshSummary result={refreshResult} />
      {circles.length > 1 && (
        <div className="space-y-1.5"><label className="text-sm font-black" htmlFor="nazem-circle">حلقة ناظم</label>
          <Select value={selectedCircle} onValueChange={changeCircle}>
            <SelectTrigger id="nazem-circle" className="min-h-11"><SelectValue /></SelectTrigger>
            <SelectContent>{circles.map((circle) => <SelectItem key={circle.key} value={circle.key}>{circle.name}{circle.organization ? ` — ${circle.organization}` : ''}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1.5">
        <label className="text-sm font-black" htmlFor="nazem-committee">حلقة مدارج</label>
        <Select value={mode === 'new' ? 'new' : committeeId} onValueChange={chooseCommittee}>
          <SelectTrigger id="nazem-committee" className="min-h-11"><SelectValue placeholder="اختر الحلقة" /></SelectTrigger>
          <SelectContent>
            {data.committees.map((committee) => <SelectItem key={committee.id} value={String(committee.id)}>{committee.name} ({committee.studentCount})</SelectItem>)}
            <SelectItem value="new">إضافة حلقة ({newCommitteeName || 'حلقة ناظم'})</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        {visibleCandidates.map((candidate) => {
          const selection = selections[candidate.id] || {};
          const suggestedStudent = data.localStudents.find((student) => (
            Number(student.id) === Number(candidate.suggestedStudentId)
          ));
          const planWithIssue = candidate.plans.find((plan) => plan.lastError);
          const isUnmatchedPlanIssue = planWithIssue?.lastErrorCode === 'NAZEM_PLAN_STUDENT_UNMATCHED';
          const planIssue = isUnmatchedPlanIssue ? '' : planWithIssue?.lastError || '';
          const availablePlans = importablePlans(candidate);
          const studentId = Number(candidate.linkedStudentId || candidate.suggestedStudentId || 0);
          const studentConflicts = conflicts.filter((row) => (
            Number(row.studentId) === studentId && !hiddenConflictIds.includes(row.id)
          ));
          const isExcluded = excludedCandidateIds.includes(candidate.id);
          const _resolve_resolveNazemStudentPlanImportDialog = () => {
            if (candidate.linkedStudentId) {
              return <div className="flex flex-col items-start gap-2">
                <div className="text-sm font-bold text-emerald-600">مرتبط بـ {candidate.linkedStudentName}</div>
                <Button
                  type="button"
                  size="sm"
                  variant={isExcluded ? 'outline' : 'ghost'}
                  className="min-h-11 gap-2"
                  onClick={() => toggleCandidate(candidate.id)}
                >
                  {isExcluded
                    ? <RotateCcw className="h-4 w-4" />
                    : <X className="h-4 w-4" />}
                  {isExcluded ? 'إعادة إلى الاستيراد' : 'استبعاد من الاستيراد'}
                </Button>
                {isExcluded && <div className="text-xs font-bold text-muted-foreground">مستبعد من هذه الدفعة فقط</div>}
              </div>;
            }
            if (suggestedStudent) {
              return <div className="flex flex-col items-start gap-2">
                <div className="text-sm font-bold text-foreground">مطابقة مقترحة: {suggestedStudent.name}</div>
                <Button
                  type="button"
                  size="sm"
                  variant={selection.confirmed ? 'outline' : 'default'}
                  className="min-h-11 gap-2"
                  disabled={selection.confirmed}
                  onClick={() => updateSelection(candidate.id, { confirmed: true })}
                >
                  <Check className="h-4 w-4" />
                  {selection.confirmed ? 'تم تأكيد المطابقة' : 'تأكيد المطابقة'}
                </Button>
              </div>;
            }
            if (importablePlans(candidate).length > 0) {
              return <div className="flex min-h-11 items-center text-xs font-bold leading-5 text-emerald-600">سيُنشأ في المنصة ويُطابق بناظم تلقائيًا</div>;
            }
            return null;
          };
          return (
            <div
              key={candidate.id}
              className={`space-y-3 rounded-xl border p-3 ${isExcluded ? 'border-muted bg-muted/30 opacity-70' : 'border-primary/15 bg-card'}`}
            >
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,1fr)_minmax(9rem,auto)] lg:items-center">
                <div className="min-w-0 space-y-1">
                  <div className="font-black text-foreground">{candidate.nazemStudentName}</div>
                  {candidate.linkedStudentId && (
                    <div className="flex items-center gap-1.5 text-xs font-black text-emerald-600">
                      <UserCheck className="h-4 w-4" />
                      موجود ومطابق في المنصة
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold text-muted-foreground">
                    {candidate.profile?.phone && <span dir="ltr">الجوال: {candidate.profile.phone}</span>}
                    {candidate.profile?.nationalId && <span dir="ltr">الهوية: {candidate.profile.nationalId}</span>}
                    {candidate.profile?.educationLevel && <span>{candidate.profile.educationLevel}</span>}
                  </div>
                </div>
                {_resolve_resolveNazemStudentPlanImportDialog()}
                <div className="min-w-0">
                  <div className={`flex min-h-11 items-center text-sm font-black ${candidate.plans.length ? 'text-emerald-600' : 'text-destructive'}`}>
                    {planStateLabel(
                      candidate,
                      availablePlans,
                      loadError || data.teacher?.lastErrorCode === 'NAZEM_PLAN_DISCOVERY_PARTIAL',
                    )}
                  </div>
                  {availablePlans.length > 1 && (
                    <div className="space-y-2">
                      <div className="text-xs font-bold leading-5 text-amber-700">
                        لدى الطالب أكثر من خطة في ناظم؛ اختر الخطة المطلوبة يدويًا.
                      </div>
                      <Select
                        value={selection.planCandidateId || ''}
                        onValueChange={(value) => updateSelection(candidate.id, {
                          planCandidateId: value,
                          importPlan: true,
                          requiresPlanChoice: false,
                        })}
                      >
                        <SelectTrigger className="min-h-11"><SelectValue placeholder="اختر خطة ناظم" /></SelectTrigger>
                        <SelectContent>
                          {availablePlans.map((plan) => (
                            <SelectItem key={plan.id} value={String(plan.id)}>
                              {plan.track || 'خطة'}{plan.amount ? ` — ${plan.amount}` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {planIssue && <div className="text-xs font-bold leading-5 text-destructive">{planIssue}</div>}
                </div>
              </div>
              {studentConflicts.map((row) => (
                <NazemConflictCard
                  key={row.id}
                  row={row}
                  busy={busyConflictId === row.id}
                  onResolve={resolveConflict}
                  onLeave={hideConflict}
                />
              ))}
            </div>
          );
        })}
      </div>
      <DialogFooter className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr]">
        <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={() => onOpenChange(false)}>إلغاء</Button>
        <Button
          type="button"
          className="min-h-11"
          disabled={saving || !candidatesWithPlans.length || hasBlockingSelection(candidatesWithPlans)}
          onClick={submit}
        >
          {saving ? 'جاري الاستيراد...' : `استيراد الطلاب ذوي الخطط (${candidatesWithPlans.length})`}
        </Button>
      </DialogFooter>
    </div>;
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92dvh] max-w-5xl [font-family:var(--font-ui)]"
        dir="rtl"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader><DialogTitle>استيراد طلاب وخطط {teacher?.teacherName} من ناظم</DialogTitle></DialogHeader>
        {data && loadError && <ErrorState message={loadError} onRetry={() => load({ refresh: true })} />}
        {_resolveNazemStudentPlanImportDialog()}
      </DialogContent>
    </Dialog>
  );
};

export default NazemStudentPlanImportDialog;

/** Apply a fresh preview or allow the cached fallback; aborted requests never update state. */
async function refreshImportPreview({ teacher, signal, applyPreview, setMode, setCommitteeId, setNewCommitteeName, setConflicts, setRefreshResult, setLoadError }) {
  try {
    const fresh = await nazemIntegrationApi.prepareImportData(teacher.teacherId, { signal });
    if (signal.aborted) return true;
    applyPreview(fresh.preview);
    setMode(fresh.mode);
    setCommitteeId(fresh.committeeId);
    setNewCommitteeName(fresh.newCommitteeName);
    setConflicts(fresh.conflicts);
    setRefreshResult(fresh.refreshResult);
    return true;
  } catch (error) {
    if (signal.aborted) return true;
    setLoadError(error.message || 'تعذر تحديث بيانات ناظم.');
  }

  return false;
}
