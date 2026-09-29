import React, { useEffect, useRef, useState } from 'react';
import { Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SectionTabs from '@/components/ui/section-tabs';
import LoadingIndicator from '@/components/ui/loading-indicator';
import StudentRankingList from './StudentRankingList';
import { loadStudentHomeRankings } from '@/services/studentHomeService';
import StudentHomeStatus from './StudentHomeStatus';

export default function StudentHomeRankings({ studentId, onReady, onStudentRank }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState('students');
  const [expanded, setExpanded] = useState(false);
  const allRows = useRef(null);
  useEffect(() => {
    if (expanded) allRows.current?.scrollIntoView({ behavior: globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  }, [expanded]);
  useEffect(() => {
    onStudentRank?.(state?.students.find(row => String(row.id) === String(studentId)) || null);
  }, [state, studentId, onStudentRank]);
  useEffect(() => {
    let active = true;
    setError('');
    loadStudentHomeRankings().then((next) => { if (active) setState(next); }).catch(() => { if (active) setError('تعذر تحميل الترتيب.'); }).finally(() => { if (active) onReady?.(true); });
    return () => { active = false; };
  }, [version, onReady]);
  const items = [{ value: 'students', label: 'أفضل الطلاب', visible: state?.settings.studentRankingsVisible !== false }, { value: 'families', label: 'أفضل الحلقات', visible: state?.settings.familyRankingsVisible !== false }].filter((item) => item.visible);
  if (state && !items.length) return null;
  const selected = items.some((item) => item.value === tab) ? tab : items[0]?.value;
  const retry = <StudentHomeStatus message="تعذر تحديث الترتيب." onRetry={() => setVersion((value) => value + 1)} />;
  const panel = (key, limit = 5) => {
  if (state[key === 'students' ? 'studentError' : 'familyError']) {
    return retry;
  }
  return <StudentRankingList limit={limit} rows={state[key]} family={key === 'families'} studentId={studentId} showPoints={state.settings.rankingPointsVisible !== false} />;
};
  const _resolveConditional = () => {
    if (error) {
      return retry;
    }
    if (!state) {
      return <div className="student-home-loading"><LoadingIndicator /></div>;
    }
    return <>
      <SectionTabs className="student-home-rank-mobile" items={items} value={selected} onChange={setTab} label="الترتيب">{panel(selected)}</SectionTabs>
      <div className="student-home-rank-desktop">{items.map((item) => <article key={item.value}><h3>{item.label}</h3>{panel(item.value)}</article>)}</div>
      {items.some((item) => state[item.value].length > 5) && <Button variant="ghost" className="student-ranking-expand" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{expanded ? 'عرض أقل' : 'عرض الكل'}</Button>}
      {expanded && <div ref={allRows} className="scroll-mt-28 mt-5" tabIndex={-1} aria-label="الترتيب الكامل">
        <div className="student-home-rank-mobile"><h3 className="mb-3 font-bold">{selected === 'students' ? 'جميع الطلاب' : 'جميع الحلقات'}</h3>{panel(selected, Infinity)}</div>
        <div className="student-home-rank-desktop">{items.map(item => <article key={item.value}><h3>{item.value === 'students' ? 'جميع الطلاب' : 'جميع الحلقات'}</h3>{panel(item.value, Infinity)}</article>)}</div>
      </div>}
    </>;
  };
  return <section className="student-home-rankings" aria-label="لوحة التميز"><h2><Trophy size={21} />لوحة التميز</h2>
    {_resolveConditional()}
  </section>;
}
