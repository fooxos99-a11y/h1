import React, { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ErrorState from '@/components/ui/error-state';
import DashboardLoader from './DashboardLoader';
import { nazemIntegrationApi } from '@/services/nazemIntegrationApi';

export const reconciliationLabels = {
  matched: 'متطابق', local_only: 'في المنصة — بانتظار تأكيد ناظم', remote_only: 'في ناظم — بانتظار اعتماد المنصة',
  points_pending: 'النقاط بانتظار التسوية', points_review: 'النقاط تحتاج مراجعة', unverified: 'لم يكتمل التحقق', unlinked: 'غير مرتبط',
};

export function NazemReconciliationRows({ rows = [] }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => rows.filter((row) => (status === 'all' || row.status === status)
    && `${row.studentName} ${row.teacherName} ${row.committeeName}`.includes(search.trim()))
    .sort((a, b) => {
  if (sort === 'difference') {
    return Math.abs(Number(b.difference || 0)) - Math.abs(Number(a.difference || 0));
  }
  if (sort === 'points') {
    return Number(b.recordedPoints || 0) - Number(a.recordedPoints || 0);
  }
  return a.studentName.localeCompare(b.studentName, 'ar');
}), [rows, search, sort, status]);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 30) - 1));
  return <section dir="rtl" className="min-w-0 space-y-3" style={{ fontFamily: 'var(--font-ui)' }} aria-label="مطابقة ناظم">
    <div className="grid min-w-0 gap-2 sm:grid-cols-3">
      <Input className="min-h-11 min-w-0" aria-label="البحث في المطابقة" placeholder="الطالب أو المعلم أو الحلقة" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
      <Select value={status} onValueChange={(value) => { setStatus(value); setPage(0); }}>
        <SelectTrigger className="min-h-11 min-w-0" aria-label="حالة المطابقة"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">كل الحالات</SelectItem>{Object.entries(reconciliationLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={sort} onValueChange={(value) => { setSort(value); setPage(0); }}>
        <SelectTrigger className="min-h-11 min-w-0" aria-label="فرز المطابقة"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="name">اسم الطالب</SelectItem><SelectItem value="difference">أكبر فرق</SelectItem><SelectItem value="points">أعلى نقاط</SelectItem></SelectContent>
      </Select>
    </div>
    {!filtered.length && <output >لا توجد نتائج مطابقة للفلاتر.</output>}
    {filtered.slice(currentPage * 30, (currentPage + 1) * 30).map((row) => { const _resolveConditional = () => {
                                                                               if (row.taskType === 'review') {
                                                                                 return 'المراجعة';
                                                                               }
                                                                               if (row.taskType === 'link') {
                                                                                 return 'الربط';
                                                                               }
                                                                               if (row.track === 'mastery') {
                                                                                 return 'الإتقان';
                                                                               }
                                                                               return 'الحفظ';
                                                                             };
                                                                             return (<article key={row.dailyId || `unlinked:${row.teacherId}:${row.studentId}`} className="min-w-0 space-y-2 rounded-xl border border-primary/20 p-3 text-sm">
      <div className="flex flex-wrap justify-between gap-2"><strong className="break-words">{row.studentName}</strong><span>{reconciliationLabels[row.status]}</span></div>
      <p className="break-words">{row.committeeName} — {row.teacherName} — {row.date}</p>
      <p>{_resolveConditional()} — {row.importedFromNazem === 'true' ? 'المصدر: ناظم' : 'المصدر: المنصة / المطابقة'}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-2"><span>المستحق: {row.expectedPoints ?? 'غير متحقق'}</span><span>المسجل: {row.recordedPoints ?? 'غير متحقق'}</span><span>الفرق: {row.difference ?? 'غير متحقق'}</span></div>
      <p className="break-words">آخر تحقق من ناظم: {row.remoteCheckedAt || 'لم يكتمل'} — النقاط: {row.pointsCheckedAt || 'لم يكتمل'}</p>
      {row.error && <p className="break-words text-destructive">{row.error}</p>}
    </article>); })}
    {filtered.length > 30 && <div className="flex items-center justify-between gap-2"><Button className="min-h-11" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>السابق</Button><span>{currentPage + 1} / {Math.ceil(filtered.length / 30)}</span><Button className="min-h-11" disabled={(currentPage + 1) * 30 >= filtered.length} onClick={() => setPage(currentPage + 1)}>التالي</Button></div>}
  </section>;
}

export default function NazemReconciliationReport({ from, to, committeeId }) {
  const [state, setState] = useState({ loading: true, rows: [] });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setState({ loading: true, rows: [] });
    nazemIntegrationApi.getReconciliation({ from, to, committeeId }).then((result) => {
      if (active) setState({ ...result, loading: false });
    }).catch((error) => { if (active) setState({ loading: false, error: error.message, rows: [] }); });
    return () => { active = false; };
  }, [from, to, committeeId, revision]);
  if (state.loading) return <DashboardLoader className="p-8" />;
  if (state.error) return <ErrorState message={state.error} onRetry={() => setRevision((value) => value + 1)} />;
  return <div className="min-w-0 space-y-3"><Button variant="outline" className="min-h-11" onClick={() => setRevision((value) => value + 1)}>تحديث التقرير</Button>
    {state.truncated && <output >توجد نتائج إضافية؛ ضيّق الفترة أو اختر حلقة لعرضها.</output>}
    <NazemReconciliationRows rows={state.rows} /></div>;
}
