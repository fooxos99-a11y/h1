import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import ErrorState from '@/components/ui/error-state';
import NazemSyncIssuesDialog from '@/components/dashboard/NazemSyncIssuesDialog';
import NazemConflictCard from '@/components/dashboard/NazemConflictCard';
import { nazemIntegrationApi } from '@/services/nazemIntegrationApi';
import { loadNazemErrors } from '@/services/nazemErrorsService';

export default function NazemErrorsDialog({ open, onOpenChange, onChanged, onEditAccount, onConfirmIdentity }) {
  const [rows, setRows] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [busyId, setBusyId] = useState(null);
  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setRows(null);
    setError('');
    const load = async () => {
      try {
        const result = await loadNazemErrors(nazemIntegrationApi, {
          isActive: () => active,
          onConflictError: cause => { if (active) setError(cause.message || 'تعذر تحميل أخطاء تعارض البيانات.'); },
        });
        if (active) { setRows(result.rows); setConflicts(result.conflicts); }
      } catch (cause) {
        if (active) setError(cause.message || 'تعذر تحميل الأخطاء.');
      }
    };
    void load();
    return () => { active = false; };
  }, [open, version]);
  const resolve = async (id, resolution) => {
    setBusyId(id);
    try {
      await nazemIntegrationApi.resolveConflict(id, resolution);
      setConflicts((current) => current.filter((row) => row.id !== id));
      setVersion((current) => current + 1);
      onChanged?.();
    } catch (cause) { setError(cause.message || 'تعذرت معالجة الخطأ.'); }
    finally { setBusyId(null); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-4xl overflow-y-auto [font-family:var(--font-ui)]" dir="rtl">
        <DialogHeader><DialogTitle>الأخطاء</DialogTitle></DialogHeader>
        {error && <ErrorState message={error} onRetry={() => setVersion((current) => current + 1)} />}
        {!rows && !error ? <DashboardLoader /> : (
          <div className="space-y-4">
            {rows?.map(({ account, data, error: accountError }) => (
              <section key={`${version}-${account.teacherId}`} className="space-y-3 rounded-xl border p-3">
                <h3 className="font-black">{account.teacherName}</h3>
                {accountError ? <p className="text-sm text-destructive">{accountError}</p> : !data.accountIssue && !data.studentIssues.length ? (
                  <p className="text-sm text-destructive">{account.status === 'requires_review' ? 'يحتاج الحساب مراجعة.' : 'تعذر ربط الحساب.'}</p>
                ) : (
                  <NazemSyncIssuesDialog inline open account={account} initialData={data} onQueued={onChanged} />
                )}
                <div className="flex flex-wrap gap-2">
                  {['failed', 'blocked'].includes(account.status) || ['NAZEM_LOGIN_REJECTED', 'NAZEM_LOGIN_FAILED'].includes(account.lastErrorCode) ? (
                    <Button className="min-h-11" onClick={() => { onOpenChange(false); onEditAccount(account); }}>تعديل بيانات الربط</Button>
                  ) : null}
                  {account.status === 'requires_review' && ['NAZEM_TEACHER_MISMATCH', 'NAZEM_ACCOUNT_IDENTITY_CHANGED'].includes(account.lastErrorCode) && (
                    <Button className="min-h-11" onClick={() => { onOpenChange(false); onConfirmIdentity(account); }}>اعتماد الحساب</Button>
                  )}
                </div>
              </section>
            ))}
            {conflicts.map((row) => (
              <section key={row.id} className="space-y-2 rounded-xl border p-3">
                <h3 className="font-black">{row.teacherName} · {row.studentName || 'الخطة'}</h3>
                <NazemConflictCard row={row} busy={busyId !== null} onResolve={resolve}
                  onLeave={(id) => setConflicts((current) => current.filter((item) => item.id !== id))} />
              </section>
            ))}
            {rows?.length === 0 && conflicts.length === 0 && !error && <p className="p-4 text-center">لا توجد أخطاء.</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" className="min-h-11" onClick={() => setVersion((current) => current + 1)}>تحديث</Button>
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
