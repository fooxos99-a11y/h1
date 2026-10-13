import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { viewNativeProgramAttachment } from '@/services/programAttachmentService';

export default function NativePdfPreview({ source, name }) {
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setBusy(true); setError('');
    // Defer presentation so a dismissed dialog / Strict Mode cleanup cannot open a stale viewer.
    const show = globalThis.setTimeout(() => {
      viewNativeProgramAttachment(source, name, controller.signal)
        .catch(() => { if (!cancelled) setError('تعذر عرض PDF. يمكنك تحميل الملف.'); })
        .finally(() => { if (!cancelled) setBusy(false); });
    }, 0);
    return () => { cancelled = true; controller.abort(); globalThis.clearTimeout(show); };
  }, [source, name, attempt]);
  return <div className="min-w-0 space-y-3 [font-family:var(--font-ui)]" dir="rtl" aria-busy={busy}>
    {error && <p role="alert" className="text-sm font-bold text-destructive">{error}</p>}
    {busy && <div className="flex min-h-16 items-center justify-center" role="status" aria-label="جارٍ عرض الملف"><LoadingSpinner size="md" /></div>}
    <Button type="button" variant="outline" className="min-h-12" disabled={busy} onClick={() => setAttempt(value => value + 1)}>عرض الملف</Button>
  </div>;
}
