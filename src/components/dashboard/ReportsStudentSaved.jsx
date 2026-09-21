import React from 'react';

const RangeValue = ({ label, value }) => (
  <div className="min-w-0">
    <div className="text-[11px] font-black text-muted-foreground">{label}</div>
    <div className="mt-1 whitespace-normal break-words text-sm font-bold leading-6 text-foreground">{value || '-'}</div>
  </div>
);

const ReportsStudentSaved = ({ rows = [] }) => {
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-primary/20 p-8 text-center text-muted-foreground">
        لا يوجد محفوظ للطلاب.
      </div>
    );
  }

  return (
    <div className="grid gap-3 [font-family:var(--font-ui)]" dir="rtl">
      {rows.map((row) => (
        <article key={row.id} className="rounded-2xl border border-primary/15 bg-background/75 p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-primary/10 pb-3">
            <h3 className="text-base font-black text-foreground">{row.studentName}</h3>
            <span className="text-xs font-bold text-muted-foreground">{row.committeeName || 'بدون حلقة'}</span>
          </div>
          <div className="grid gap-3">
            <RangeValue label="كامل المحفوظ" value={row.memorizationRange} />
          </div>
        </article>
      ))}
    </div>
  );
};

export default ReportsStudentSaved;
