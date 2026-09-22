import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getQuranTaskLabel } from '@/lib/quranTaskLabels';
import { canRetryNazemIssue, nazemIssueMessage, nazemRetryLabel } from '@/lib/nazemSyncIssues';

const labels = {
  synced: 'أُرسل إلى ناظم', pending: 'قيد الانتظار', syncing: 'جارٍ الإرسال',
  retrying: 'إعادة المحاولة', blocked: 'معلّق', failed: 'تعذر الإرسال',
  requires_review: 'يحتاج مراجعة', conflict: 'تعارض', dismissed: 'مغلق',
};
const operations = {
  'attendance.submit': 'الحضور', 'account.verify': 'ربط الحساب',
  'account.discover_plans': 'قراءة الخطط', 'account.reconcile': 'تحديث الطلاب والخطط',
  'plan.upsert': 'حفظ الخطة', 'plan.delete': 'حذف الخطة', 'recitation.submit': 'التسميع',
};
const entryLabel = entry => entry.taskType ? getQuranTaskLabel(entry) : operations[entry.operationType] || entry.operationType;

export default function NazemSessionLogCard({ group, retryJob, retryingJobId }) {
  return <article className="rounded-xl border border-primary/15 bg-card p-3 [font-family:var(--font-ui)]" dir="rtl">
    <div className="font-black text-foreground">{group.studentName || group.teacherName}{group.date ? ` — ${group.date}` : ''}</div>
    {group.studentName && <div className="text-xs text-muted-foreground">{group.teacherName}</div>}
    <div className="mt-2 divide-y divide-primary/10">
      {group.entries.map(entry => <div key={entry.jobId || entry.id} className="py-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold">
          <span>{entryLabel(entry)}</span>
          <span className={entry.status === 'synced' ? 'text-emerald-700' : 'text-amber-700'}>{entry.status === 'synced' && (entry.authoritative || entry.alreadyRecorded) ? 'مؤكد في ناظم' : labels[entry.status] || 'يحتاج مراجعة'}</span>
        </div>
        {(entry.message || entry.errorCode) && <p className="mt-1 break-words text-xs leading-6">{nazemIssueMessage(entry)}</p>}
        <details className="mt-1 text-xs text-muted-foreground">
          <summary className="min-h-11 cursor-pointer content-center">التفاصيل</summary>
          <p>{entry.createdAt} · المحاولة {entry.attemptNumber || 0}</p>
          {entry.errorCode && <p className="break-all" dir="ltr">{entry.errorCode}</p>}
        </details>
        {entry.jobId && canRetryNazemIssue(entry) && <Button type="button" variant="outline" size="sm" className="min-h-11 gap-2" disabled={retryingJobId != null} onClick={() => retryJob(entry.jobId)}>
          <RefreshCw className={`h-4 w-4 ${retryingJobId === entry.jobId ? 'animate-spin' : ''}`} />{nazemRetryLabel(entry)}
        </Button>}
      </div>)}
    </div>
    {group.history.length > 0 && <details className="text-xs text-muted-foreground">
      <summary className="min-h-11 cursor-pointer content-center">السجل السابق ({group.history.length})</summary>
      {group.history.map(entry => <p key={entry.id} className="break-words py-2 leading-5">{entryLabel(entry)} · {labels[entry.status] || entry.status} · {entry.createdAt}{entry.message ? ` — ${entry.message}` : ''}</p>)}
    </details>}
  </article>;
}
