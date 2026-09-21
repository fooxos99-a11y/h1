import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { filterStudentPoints } from '@/lib/studentPointsReport';

const pageSize = 20;
const format = (value) => Number(value || 0).toLocaleString('ar-SA-u-nu-latn');

export default function StudentPointsReport({ rows = [] }) {
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => filterStudentPoints(rows, '', 'points_desc'), [rows]);
  const lastPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  return <section className="min-w-0 space-y-3 [font-family:var(--font-ui)]" dir="rtl" aria-label="نقاط الطلاب">
    {!filtered.length && <p role="status" className="p-6 text-center text-muted-foreground">لا يوجد طلاب.</p>}
    {filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((student) => <details key={student.studentId} className="min-w-0 rounded-xl border border-primary/20 p-3">
      <summary className="min-h-11 cursor-pointer rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        <span className="break-words font-bold">{student.studentName}</span>
        <span className="ms-2 text-sm text-muted-foreground">{student.committeeName || 'بدون حلقة'}</span>
        <span className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <span>صافي الفترة: <b>{format(student.total)}</b></span>
          <span>إضافات: {format(student.increases)}</span><span>خصومات: {format(student.deductions)}</span>
          <span>الرصيد الكلي: {format(student.balance)}</span>
        </span>
      </summary>
      {!student.transactions.length && <p className="pt-3 text-sm text-muted-foreground">لا توجد حركات في الفترة المحددة.</p>}
      <ul className="mt-3 space-y-2">
        {student.transactions.map((row) => <li key={row.id} className="min-w-0 border-t border-primary/10 pt-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2"><span>{row.date} — {row.source}</span>
            <b className={row.type === 'deduction' ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}>
              {row.type === 'deduction' ? 'خصم' : 'إضافة'} {format(row.points)}</b></div>
          <p className="mt-1 break-words leading-6">{row.reason || row.source}</p>
          <p className="mt-1 break-words text-muted-foreground">بواسطة: {row.actorName}</p>
        </li>)}
      </ul>
    </details>)}
    {lastPage > 0 && <nav className="flex flex-wrap items-center justify-center gap-3" aria-label="صفحات الطلاب">
      <Button variant="outline" className="min-h-11" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>السابق</Button>
      <span>{format(currentPage + 1)} / {format(lastPage + 1)}</span>
      <Button variant="outline" className="min-h-11" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>التالي</Button>
    </nav>}
  </section>;
}
