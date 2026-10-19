import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { getQuranTaskLabel } from '@/lib/quranTaskLabels';

export default function RecitationPendingStatus({ receipts = [], onRetry }) {
  const [retrying, setRetrying] = useState(false);
  const failures = [...new Map(receipts.filter(receipt => ['local_failed', 'local_rejected'].includes(receipt.status))
    .map(receipt => [`${receipt.studentId}:${receipt.taskDate}:${receipt.taskType}:${receipt.error}`, receipt])).values()];
  if (!failures.length) return null;
  return <div className="space-y-2 [font-family:var(--font-ui)]" dir="rtl">
    {failures.map(receipt => <div key={`${receipt.studentId}:${receipt.taskDate}:${receipt.taskType}:${receipt.taskId}`}
      role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
      <p className="font-bold">{receipt.studentName} · {getQuranTaskLabel(receipt)} · <time dateTime={receipt.taskDate}>{receipt.taskDate}</time></p>
      <p className="mt-1 break-words">{receipt.error || 'تعذر اعتماد التسميع. بقي التقييم محفوظًا على الجهاز.'}</p>
    </div>)}
    <Button type="button" variant="outline" className="min-h-11" disabled={retrying} onClick={async () => {
      setRetrying(true);
      try { await onRetry(); } finally { setRetrying(false); }
    }}>{retrying ? 'جارٍ إعادة المحاولة' : 'إعادة المحاولة'}</Button>
  </div>;
}
