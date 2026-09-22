import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock3, RefreshCw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import ErrorState from '@/components/ui/error-state';
import { nazemIntegrationApi } from '@/services/nazemIntegrationApi';
import { getQuranTaskLabel } from '@/lib/quranTaskLabels';
import { canRetryNazemIssue } from '@/lib/nazemSyncIssues';

const statusDetails = {
  synced: { label: 'اكتملت المزامنة', className: 'text-emerald-700 bg-emerald-500/10', Icon: CheckCircle2 },
  pending: { label: 'قيد الانتظار', className: 'text-sky-700 bg-sky-500/10', Icon: Clock3 },
  syncing: { label: 'جارٍ الإرسال', className: 'text-sky-700 bg-sky-500/10', Icon: RefreshCw },
  retrying: { label: 'إعادة المحاولة', className: 'text-amber-700 bg-amber-500/10', Icon: RefreshCw },
  blocked: { label: 'معلّق', className: 'text-amber-700 bg-amber-500/10', Icon: Clock3 },
  failed: { label: 'فشل', className: 'text-destructive bg-destructive/10', Icon: XCircle },
  requires_review: { label: 'يحتاج مراجعة', className: 'text-amber-700 bg-amber-500/10', Icon: XCircle },
  conflict: { label: 'تعارض', className: 'text-destructive bg-destructive/10', Icon: XCircle },
  dismissed: { label: 'مغلق', className: 'text-muted-foreground bg-muted', Icon: XCircle },
};

const operationLabels = {
  'account.verify': 'ربط الحساب',
  'account.discover_plans': 'قراءة الخطط',
  'account.reconcile': 'تحديث الطلاب والخطط',
  'plan.upsert': 'حفظ الخطة',
  'plan.delete': 'حذف الخطة',
  'attendance.submit': 'إرسال الحضور',
  'recitation.submit': 'إرسال التسميع',
};

const NazemLogDialog = ({ open, onOpenChange }) => {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [retryingJobId, setRetryingJobId] = useState(null);

  const load = useCallback(async () => {
    try {
      setError('');
      setRefreshing(true);
      setEntries(await nazemIntegrationApi.getLog());
    } catch (cause) {
      setError(cause.message || 'تعذر تحميل سجل ناظم.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  const retryJob = useCallback(async (jobId) => {
    try {
      setError('');
      setRetryingJobId(jobId);
      await nazemIntegrationApi.retryJob(jobId);
      await load();
    } catch (cause) {
      setError(cause.message || 'تعذرت إعادة محاولة عملية ناظم.');
    } finally {
      setRetryingJobId(null);
    }
  }, [load]);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  const _resolveNazemLogDialog = () => {
    if (error) {
      return <ErrorState message={error} onRetry={load} />;
    }
    if (!entries) {
      return <DashboardLoader />;
    }
    return <div className="space-y-2 overflow-y-auto overscroll-contain">
            {entries.length ? entries.map((entry) => {
              const details = statusDetails[entry.status] || statusDetails.failed;
              const StatusIcon = details.Icon;
              const _resolve_resolveNazemLogDialog = () => {
                if (entry.status === 'synced' && entry.alreadyRecorded) {
                  return 'موجود مسبقًا في ناظم';
                }
                if (entry.status === 'synced' && entry.authoritative) {
                  return 'اعتُمد من نتيجة ناظم';
                }
                return details.label;
              };
              return (
                <article key={`${entry.id}-${entry.createdAt}`} className="rounded-xl border border-primary/15 bg-card p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-black text-foreground">
                        {operationLabels[entry.operationType] || entry.operationType}
                        {entry.studentName ? ` — ${entry.studentName}` : ''}
                        {entry.taskType ? ` — ${getQuranTaskLabel(entry)}` : ''}
                        {entry.taskDate ? ` — ${entry.taskDate}` : ''}
                      </div>
                      <div className="mt-0.5 text-xs font-bold text-muted-foreground">
                        {entry.teacherName} · {entry.createdAt}
                        {entry.attemptNumber > 0 ? ` · المحاولة ${entry.attemptNumber}` : ''}
                        {entry.entryKind === 'current' ? ' · الحالة الحالية' : ' · حدث سابق'}
                      </div>
                    </div>
                    <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-black ${details.className}`}>
                      <StatusIcon className={`h-4 w-4 ${entry.status === 'syncing' || entry.status === 'retrying' ? 'animate-spin' : ''}`} />
                      {_resolve_resolveNazemLogDialog()}
                    </span>
                  </div>
                  {(entry.message || entry.errorCode) && (
                    <div className="mt-2 break-words rounded-lg bg-muted/60 px-2.5 py-2 text-xs font-bold leading-5 text-foreground">
                      {entry.message || entry.errorCode}
                      {entry.message && entry.errorCode ? ` (${entry.errorCode})` : ''}
                    </div>
                  )}
                  {entry.entryKind === 'current' && entry.jobId && canRetryNazemIssue(entry) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2 min-h-10 gap-2"
                      disabled={retryingJobId === entry.jobId}
                      onClick={() => retryJob(entry.jobId)}
                    >
                      <RefreshCw className={`h-4 w-4 ${retryingJobId === entry.jobId ? 'animate-spin' : ''}`} />
                      إعادة المحاولة
                    </Button>
                  )}
                </article>
              );
            }) : (
              <div className="rounded-xl border border-primary/15 p-4 text-center text-sm font-bold text-muted-foreground">
                لا توجد عمليات في سجل ناظم.
              </div>
            )}
          </div>;
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-3xl [font-family:var(--font-ui)]" dir="rtl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pl-8">
            <DialogTitle>سجل ناظم</DialogTitle>
            <Button type="button" variant="outline" size="sm" className="min-h-10 gap-2" disabled={refreshing} onClick={load}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              تحديث
            </Button>
          </div>
        </DialogHeader>
        {_resolveNazemLogDialog()}
        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NazemLogDialog;
