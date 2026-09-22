import React, { lazy, Suspense } from 'react';
import LoadingIndicator from '@/components/ui/loading-indicator';
import { ArrowLeft, BookOpen, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StudentHomeProgress from './StudentHomeProgress';
import StudentHomeStatus from './StudentHomeStatus';

const Execution = lazy(() => import('@/components/portal/QuranExecutionDialog'));

export default function StudentTodayCard({ model, loading, error, onRetry, onRead, studentId, executionEnabled, onExecutionReady }) {
  return <section className="student-home-today" aria-labelledby="student-home-today-title" aria-busy={loading}>
    <div className="student-home-section-head"><h1 id="student-home-today-title"><BookOpen />خطة اليوم</h1><strong>{loading ? '—' : model.percent}<small>%</small></strong></div>
    <StudentHomeProgress value={model.percent} label="إنجاز خطة اليوم" />
    {error && <StudentHomeStatus message="تعذر تحديث خطة اليوم." onRetry={onRetry} />}
    {loading ? <div className="student-home-skeleton" aria-label="تحميل خطة اليوم" /> : <>
      {executionEnabled ? <Suspense fallback={<LoadingIndicator />}><Execution studentId={studentId} inline compact onReady={onExecutionReady} /></Suspense> : <div className="student-home-task-grid">{model.groups.map((group) => <Button key={group.type} variant="outline" className="student-home-task" disabled={!group.target} onClick={() => onRead(group.target)}><span>{group.label}{group.complete && <Check size={15} aria-label="مكتمل" />}</span><small>{group.amount}</small></Button>)}</div>}
      {!model.groups.length && !error && <p className="student-home-empty">لا توجد مقادير لهذا اليوم.</p>}
    </>}
    <Button className="student-home-primary" onClick={() => onRead(model.groups.find((group) => group.type === 'memorization')?.target || model.groups[0]?.target || null)}><BookOpen size={19} />فتح المصحف<ArrowLeft className="student-home-arrow" size={18} /></Button>
  </section>;
}
