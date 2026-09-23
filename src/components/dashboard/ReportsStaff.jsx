import React, { useMemo } from 'react';
import { formatClockTime } from '../../../shared/clock-time.js';

const statusLabels = { present: 'حاضر', late: 'متأخر', excused: 'مستأذن', absent: 'غائب', unrecorded: 'لم يُرصد' };
const roleLabels = { supervisor: 'معلم', reciter: 'مقرئ', admin: 'إداري' };

export default function ReportsStaff({ rows = [] }) {
  const people = useMemo(() => {
    const grouped = new Map();
    for (const row of rows) {
      if (!grouped.has(row.id)) grouped.set(row.id, { ...row, days: [] });
      grouped.get(row.id).days.push(row);
    }
    return [...grouped.values()];
  }, [rows]);
  if (!people.length) return <div className="p-6 text-center text-muted-foreground">لا توجد بيانات ضمن الفترة المحددة.</div>;
  return <div className="space-y-3 [font-family:var(--font-ui)]" dir="rtl">
    {people.map((person) => <article key={person.id} className="rounded-xl border border-primary/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-bold">{person.name} <span className="text-sm text-muted-foreground">{roleLabels[person.role] || person.jobTitle}</span></div>
        <div className="flex flex-wrap gap-3 text-sm">
          <span>الحضور: {person.days.filter(({ status }) => ['present', 'late'].includes(status)).length}</span>
          <span>التأخر: {person.days.filter(({ status }) => status === 'late').length}</span>
        </div>
      </div>
      <details className="mt-2">
        <summary className="min-h-11 cursor-pointer py-3 text-sm text-primary focus-visible:outline-primary">تفاصيل الأيام</summary>
        <div className="divide-y divide-border">
          {person.days.map((day) => <div key={day.recordDate} className="grid grid-cols-3 gap-2 py-3 text-sm">
            <span dir="ltr" className="text-right">{day.recordDate}</span>
            <span className={day.status === 'late' ? 'text-amber-700 dark:text-amber-300' : ''}>{statusLabels[day.status] || 'لم يُرصد'}</span>
            <span>{day.checkInTime ? formatClockTime(day.checkInTime) : '—'}</span>
          </div>)}
        </div>
      </details>
    </article>)}
  </div>;
}
