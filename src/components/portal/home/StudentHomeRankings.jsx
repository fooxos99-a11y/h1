import React, { useEffect, useState } from 'react';
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
  const [limits, setLimits] = useState({ students: 20, families: 20 });
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
  const panel = (key) => {
  if (state[key === 'students' ? 'studentError' : 'familyError']) {
    return retry;
  }
  return <>
    <StudentRankingList limit={limits[key]} rows={state[key]} family={key === 'families'} studentId={studentId} showPoints={state.settings.rankingPointsVisible !== false} />
    {state[key].length > limits[key] && <Button variant="ghost" className="student-ranking-expand" onClick={() => setLimits((current) => ({ ...current, [key]: current[key] + 10 }))}>اعرض المزيد</Button>}
  </>;
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
    </>;
  };
  return <section className="student-home-rankings" aria-label="لوحة التميز"><h2><Trophy size={21} />لوحة التميز</h2>
    {_resolveConditional()}
  </section>;
}
