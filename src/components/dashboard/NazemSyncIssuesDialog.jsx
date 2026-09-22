import NazemIssueDate from '@/components/dashboard/NazemIssueDate';
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
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
import { useToast } from '@/components/ui/use-toast';
import { canRetryNazemIssue, nazemIssueMessage, nazemRetryLabel } from '@/lib/nazemSyncIssues';

const NazemSyncIssuesDialog = ({ account, open, onOpenChange, onQueued, inline = false, initialData = null }) => {
  const { toast } = useToast();
  const [data, setData] = useState(initialData);
  const [error, setError] = useState('');
  const [retryingStudentId, setRetryingStudentId] = useState('');
  const [queuedStudents, setQueuedStudents] = useState([]);

  const load = useCallback(async () => {
    if (!account?.teacherId) return;
    try {
      setError('');
      setData(await nazemIntegrationApi.getAccountIssues(account.teacherId));
    } catch (cause) {
      setError(cause.message || 'تعذر تحميل تفاصيل مزامنة ناظم.');
    }
  }, [account?.teacherId]);

  useEffect(() => {
    if (open && !initialData) void load();
  }, [initialData, load, open]);

  const retryIssue = async (issue) => {
    const issueKey = `${issue.issueKind}-${issue.id}`;
    try {
      setRetryingStudentId(issueKey);
      if (issue.jobId) await nazemIntegrationApi.retryJob(issue.jobId);
      else await nazemIntegrationApi.retryStudentDiscovery(account.teacherId, issue.studentExternalId);
      setQueuedStudents((current) => [...new Set([...current, issueKey])]);
      onQueued?.();
      toast({ title: issue.jobId ? 'جُدولت إعادة المزامنة مع ناظم' : 'ستتم إعادة قراءة خطة الطالب من ناظم' });
    } catch (cause) {
      toast({
        title: 'تعذرت جدولة إعادة المحاولة',
        description: cause.message,
        variant: 'destructive',
      });
    } finally {
      setRetryingStudentId('');
    }
  };

  const _resolveContent = () => {
    if (error) {
      return <ErrorState message={error} onRetry={load} />;
    }
    if (!data) {
      return <DashboardLoader />;
    }
    return <div className="space-y-3 overflow-y-auto">
            {data.accountIssue && (
              <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm font-bold leading-6 text-amber-800">
                {data.accountIssue.message}
                <NazemIssueDate value={data.accountIssue.lastSeenAt} />
              </div>
            )}
            {data.studentIssues.length ? data.studentIssues.map((issue) => {
              const issueKey = `${issue.issueKind}-${issue.id}`;
              const queued = queuedStudents.includes(issueKey);
              const retryable = canRetryNazemIssue(issue);
              return (
                <div key={issueKey} className="grid gap-3 rounded-xl border border-primary/15 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="font-black text-foreground">{issue.studentName}</div>
                    {issue.circleName && <div className="text-xs font-bold text-muted-foreground">{issue.circleName}</div>}
                    <div className="mt-1 text-xs font-bold leading-5 text-destructive">{nazemIssueMessage(issue)}</div>
                    <NazemIssueDate value={issue.lastSeenAt} />
                  </div>
                  {retryable && (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 gap-2"
                      disabled={queued || retryingStudentId === issueKey}
                      onClick={() => retryIssue(issue)}
                    >
                      <RefreshCw className={`h-4 w-4 ${retryingStudentId === issueKey ? 'animate-spin' : ''}`} />
                      {queued ? 'تمت الجدولة' : nazemRetryLabel(issue)}
                    </Button>
                  )}
                </div>
              );
            }) : !data.accountIssue && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm font-bold text-emerald-700">
                لا توجد أخطاء مزامنة تحتاج مراجعة.
              </div>
            )}
          </div>;
  };
  const content = (<>
        {_resolveContent()}
  </>);
  if (inline) return content;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-2xl [font-family:var(--font-ui)]" dir="rtl">
        <DialogHeader><DialogTitle>تفاصيل مزامنة ناظم — {account?.teacherName}</DialogTitle></DialogHeader>
        {content}
        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NazemSyncIssuesDialog;
