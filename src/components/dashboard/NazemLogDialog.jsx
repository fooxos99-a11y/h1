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
import { groupNazemLogEntries } from '@/lib/nazemLogGroups';
import NazemSessionLogCard from '@/components/dashboard/NazemSessionLogCard';

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
            {entries.length ? groupNazemLogEntries(entries).map((group) => <NazemSessionLogCard key={group.key} group={group} retryJob={retryJob} retryingJobId={retryingJobId} />) : (
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
