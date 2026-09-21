import React from 'react';
import useRewardUnits from '@/hooks/useRewardUnits';

const formatPoints = (value) => Number(value || 0).toLocaleString('ar-SA-u-nu-latn');

const ReportsStudentPoints = ({ rows = [] }) => {
  const rewardUnits = useRewardUnits();
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-primary/20 p-8 text-center font-bold text-muted-foreground">
        لا يوجد طلاب في الحلقة المحددة.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-primary/20 [font-family:var(--font-ui)]" dir="rtl">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(5rem,auto)] bg-background/80 px-3 py-2 text-xs font-black text-muted-foreground sm:grid-cols-[minmax(0,1fr)_minmax(10rem,1fr)_7rem]">
        <span>الطالب</span>
        <span className="hidden sm:block">الحلقة</span>
        <span className="text-center">{rewardUnits.text('الكيلومترات')}</span>
      </div>
      {rows.map((row) => (
        <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_minmax(5rem,auto)] items-center border-t border-primary/10 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,1fr)_7rem]">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-foreground">{row.name}</p>
            <p className="mt-0.5 truncate text-xs font-bold text-muted-foreground sm:hidden">{row.committeeName || 'بدون حلقة'}</p>
          </div>
          <p className="hidden truncate text-sm font-bold text-muted-foreground sm:block">{row.committeeName || 'بدون حلقة'}</p>
          <p className="text-center text-base font-black text-primary tabular-nums">{formatPoints(row.points)}</p>
        </div>
      ))}
    </div>
  );
};

export default ReportsStudentPoints;
