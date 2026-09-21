import React, { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import ErrorState from '@/components/ui/error-state';
import NazemConflictCard from '@/components/dashboard/NazemConflictCard';
import { nazemIntegrationApi } from '@/services/nazemIntegrationApi';
import { useToast } from '@/components/ui/use-toast';

const NazemConflictsDialog = ({ open, onOpenChange, onChanged }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [hiddenIds, setHiddenIds] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoadError('');
      setRows(null);
      setHiddenIds([]);
      setRows(await nazemIntegrationApi.getConflicts());
    } catch (error) {
      setLoadError(error.message || 'تعذر تحميل تعارضات ناظم.');
      toast({ title: 'تعذر تحميل تعارضات ناظم', description: error.message, variant: 'destructive' });
    }
  }, [toast]);

  useEffect(() => {
    if (open) load();
  }, [load, open]);

  const resolve = async (conflictId, resolution) => {
    try {
      setBusyId(conflictId);
      await nazemIntegrationApi.resolveConflict(conflictId, resolution);
      await load();
      onChanged?.();
    } catch (error) {
      toast({ title: 'تعذر حل التعارض', description: error.message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const resolveRecitationsFromNazem = async () => {
    const targets = rows.filter((row) => row.entityType === 'recitation_day');
    setBulkConfirmOpen(false);
    setBulkProgress({ completed: 0, total: targets.length });
    let completed = 0;
    const failures = [];
    try {
      for (const conflict of targets) {
        try {
          await nazemIntegrationApi.resolveConflict(conflict.id, 'use_nazem');
          completed += 1;
        } catch (error) {
          failures.push(error);
        }
        setBulkProgress({ completed: completed + failures.length, total: targets.length });
      }
      toast(failures.length ? {
        title: `اعتمدت ${completed} من ${targets.length} تعارضًا`,
        description: failures[0]?.message || 'تعذر اعتماد بعض التعارضات.',
        variant: 'destructive',
      } : { title: `اعتمدت نتائج ناظم في ${completed} تعارضًا` });
      await load();
      onChanged?.();
    } catch (error) {
      toast({ title: 'تعذر تحديث قائمة التعارضات', description: error.message, variant: 'destructive' });
    } finally {
      setBulkProgress(null);
    }
  };

  const recitationConflictCount = rows?.filter((row) => row.entityType === 'recitation_day').length || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto [font-family:var(--font-ui)]" dir="rtl">
        <DialogHeader><DialogTitle>تعارضات ناظم</DialogTitle></DialogHeader>
        {loadError ? <ErrorState message={loadError} onRetry={load} /> : !rows ? <DashboardLoader /> : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">لا توجد تعارضات.</div>
        ) : (
          <div className="space-y-3">
            {recitationConflictCount > 0 && (
              <Button
                type="button"
                className="min-h-11 w-full sm:w-auto"
                disabled={bulkProgress !== null || busyId !== null}
                onClick={() => setBulkConfirmOpen(true)}
              >
                {bulkProgress
                  ? `جاري الاعتماد ${bulkProgress.completed} من ${bulkProgress.total}`
                  : `اعتماد نتائج ناظم لكل تعارضات التسميع (${recitationConflictCount})`}
              </Button>
            )}
            {rows.filter((row) => !hiddenIds.includes(row.id)).map((row) => (
              <div key={row.id} className="space-y-2">
                <div className="font-black">{row.studentName || 'الخطة'} · {row.teacherName}</div>
                <NazemConflictCard
                  row={row}
                  busy={bulkProgress !== null || busyId === row.id}
                  onResolve={resolve}
                  onLeave={(conflictId) => setHiddenIds((current) => [...current, conflictId])}
                />
              </div>
            ))}
          </div>
        )}
      </DialogContent>
      <Dialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <DialogContent className="max-w-md [font-family:var(--font-ui)]" dir="rtl">
          <DialogHeader>
            <DialogTitle>اعتماد نتائج ناظم</DialogTitle>
          </DialogHeader>
          <p className="text-sm font-bold leading-6 text-muted-foreground">
            سيُعتمد تقييم ناظم في جميع تعارضات التسميع الظاهرة وعددها {recitationConflictCount}.
          </p>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setBulkConfirmOpen(false)}>
              إلغاء
            </Button>
            <Button type="button" className="min-h-11" onClick={resolveRecitationsFromNazem}>
              اعتماد الكل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

export default NazemConflictsDialog;
