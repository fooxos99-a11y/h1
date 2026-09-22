import React, { useId } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

const NazemPlanRefreshSummary = ({ result }) => {
  const titleId = useId();
  if (!result) return null;
  const changes = Array.isArray(result.planChanges) ? result.planChanges : [];
  const appliedCount = changes.filter((change) => change.status === 'applied').length;
  const reviewCount = changes.length - appliedCount;

  return (
    <section className="space-y-2 [font-family:var(--font-ui)]" aria-labelledby={titleId} dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={titleId} className="text-sm font-black text-foreground">تغييرات الخطط بعد التحديث</h3>
        {changes.length > 0 && (
          <div className="text-xs font-bold text-muted-foreground">
            طُبقت {appliedCount}{reviewCount > 0 ? ` · تحتاج مراجعة ${reviewCount}` : ''}
          </div>
        )}
      </div>
      {changes.length === 0 ? (
        <div className="flex min-h-11 items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 text-sm font-bold text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          تم فحص الخطط المرتبطة ولم يُكتشف أي تغيير.
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {changes.map((change, index) => {
            const applied = change.status === 'applied';
            const Icon = applied ? CheckCircle2 : AlertTriangle;
            return (
              <article
                key={`${change.studentId || change.planId || 'plan'}-${index}`}
                className={`min-w-0 rounded-xl border p-3 ${
                  applied
                    ? 'border-emerald-500/30 bg-emerald-500/10'
                    : 'border-amber-500/40 bg-amber-500/10'
                }`}
              >
                <div className={`flex items-center gap-2 text-sm font-black ${applied ? 'text-emerald-700' : 'text-amber-800'}`}>
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{change.studentName || 'طالب'}</span>
                </div>
                <div className="mt-1 text-xs font-bold leading-5 text-foreground">
                  {change.message || (applied ? 'تم تحديث الخطة في الحبيب ماب من ناظم.' : 'تحتاج الخطة إلى مراجعة.')}
                </div>
                {change.differences && (
                  <div className="mt-1 text-xs font-bold leading-5 text-muted-foreground">{change.differences}</div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default NazemPlanRefreshSummary;
