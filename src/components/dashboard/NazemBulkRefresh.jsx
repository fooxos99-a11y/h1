import LoadingSpinner from '@/components/ui/loading-spinner';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ProgressBar from '@/components/ui/progress-bar';
import NazemPlanRefreshSummary from '@/components/dashboard/NazemPlanRefreshSummary';
import { nazemIntegrationApi } from '@/services/nazemIntegrationApi';
import { refreshNazemAccounts } from '@/services/nazemBulkRefresh';

const labels = {
  pending: 'بانتظار التحديث', syncing: 'جارٍ التحديث', retrying: 'إعادة المحاولة تلقائيًا',
  synced: 'اكتمل التحديث', failed: 'تعذر التحديث', blocked: 'تعذر التحديث',
  requires_review: 'يحتاج مراجعة', dismissed: 'أُوقفت العملية',
};

export default function NazemBulkRefresh({ accounts, disabled, onChanged, buttonContainer }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  const start = async () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      await refreshNazemAccounts(accounts, {
        api: nazemIntegrationApi, signal: controller.signal,
        onUpdate: (next) => { if (!controller.signal.aborted) setRows(next); },
        pause: (signal) => new Promise((resolve, reject) => {
          const abort = () => { window.clearTimeout(timer); reject(signal.reason); };
          const timer = window.setTimeout(() => {
            signal.removeEventListener('abort', abort);
            resolve();
          }, 5_000);
          signal.addEventListener('abort', abort, { once: true });
          if (signal.aborted) abort();
        }),
      });
      if (!controller.signal.aborted) await onChanged();
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause.message || 'تعذر تحديث ناظم.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      request.current = null;
    }
  };
  const refreshButton = <Button type="button" className="min-h-11 gap-2" onClick={start}
        disabled={disabled || busy || !accounts.some((account) => account.status === 'connected')}>
        {busy ? <LoadingSpinner /> : <RefreshCw aria-hidden="true" className="h-4 w-4" />}
        {busy ? 'جارٍ تحديث الكل' : 'تحديث الكل'}
      </Button>;
  return (
    <div className="space-y-3 [font-family:var(--font-ui)]" dir="rtl">
      {buttonContainer ? createPortal(refreshButton, buttonContainer) : refreshButton}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="space-y-2" role="status" aria-live="polite">
        {rows.map((row) => (
          <div key={row.teacherId} className="space-y-2 rounded-xl border p-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="font-bold">{row.teacherName}</span>
              <span>{labels[row.status] || 'جارٍ التحديث'}</span>
            </div>
            <ProgressBar label={`تقدم تحديث ${row.teacherName}`} value={row.status === 'synced' ? 100 : Number(row.progressPercent || 0)} />
            {row.lastError && <p className="break-words text-destructive">{row.lastError}</p>}
            {row.result && <NazemPlanRefreshSummary result={row.result} />}
          </div>
        ))}
      </div>
    </div>
  );
}
