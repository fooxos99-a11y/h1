import React from 'react';
import useRewardUnits from '@/hooks/useRewardUnits';

const TeacherPointsReport = ({ rows = [], showTeacher = false }) => {
  const rewardUnits = useRewardUnits();
  if (!rows.length) {
    return <div className="rounded-xl border border-dashed border-primary/20 p-8 text-center font-bold text-muted-foreground">لا توجد عمليات في الفترة المحددة.</div>;
  }

  return (
    <div className="space-y-2 [font-family:var(--font-ui)]" dir="rtl">
      {rows.map((row) => {
        const isIncrease = row.type === 'increase';
        return (
          <div key={row.id} className="rounded-xl border border-primary/15 bg-background/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-foreground">{row.studentName}</p>
                <p className="mt-1 text-xs font-bold text-muted-foreground">{row.transactionDate}{showTeacher ? ` — ${row.teacherName}` : ''}</p>
              </div>
              <span className={`text-sm font-black tabular-nums ${isIncrease ? 'text-emerald-500' : 'text-destructive'}`}>
                {isIncrease ? 'إضافة +' : 'خصم -'}{rewardUnits.format(row.points)}
              </span>
            </div>
            <p className="mt-3 border-t border-primary/10 pt-3 text-sm font-bold leading-6 text-muted-foreground">{rewardUnits.text(row.reason)}</p>
          </div>
        );
      })}
    </div>
  );
};

export default TeacherPointsReport;
