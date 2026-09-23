import StudentNewsCard from './StudentNewsCard';
import React, { lazy, Suspense, useEffect, useState } from 'react';
import useMediaQuery from '@/hooks/useMediaQuery';
import useStudentHomeNavigation from '@/hooks/useStudentHomeNavigation';
import StudentBottomNavigation from './StudentBottomNavigation';
import StudentHomeStatus from './StudentHomeStatus';
import LoadingIndicator from '@/components/ui/loading-indicator';
import PageLoadingBoundary from '@/components/ui/page-loading-boundary';
import useStudentPlan from '@/hooks/useStudentPlan';
import useSaudiClock from '@/hooks/useSaudiClock';
import { useSiteConfig } from '@/site/SiteProvider';
import { getBusinessDate } from '../../../../shared/business-date.js';
import { studentPlanLevel as currentPlanProgress } from '@/lib/studentPlanLevel';
import { studentHomePlan, studentJourneySummary, studentHomeFeatures } from '@/lib/studentHome';
import { loadStudentHomeExtras } from '@/services/studentHomeService';
import StudentHomeHeader from './StudentHomeHeader';
import StudentTodayCard from './StudentTodayCard';
import StudentHomeJourney from './StudentHomeJourney';
import StudentHomeChallenge from './StudentHomeChallenge';
import StudentHomeRankings from './StudentHomeRankings';
import StudentHomeWindow from './StudentHomeWindow';
import './student-home.css';

const Sessions = lazy(() => import('./StudentSessions'));
const Mushaf = lazy(() => import('@/components/portal/StudentMushafSection'));
const Store = lazy(() => import('@/components/portal/StudentStoreSection'));
const Programs = lazy(() => import('@/components/portal/StudentProgramsSection'));
const Calls = lazy(() => import('./StudentCalls'));
const Journey = lazy(() => import('@/components/portal/SummitJourneySection'));
const Challenge = lazy(() => import('@/components/portal/StudentDailyChallengeSection'));
const titles = { sessions: 'الجلسات', mushaf: 'المصحف', store: 'المتجر', programs: 'البرامج', calls: 'المكالمات', journey: 'الخريطة', challenge: 'التحدي اليومي' };

export default function StudentHome(props) {
  return <PageLoadingBoundary key={props.studentId}><StudentHomeContent {...props} /></PageLoadingBoundary>;
}

function StudentHomeContent({ studentId, showPath, showDailyChallenge, executionEnabled, onLogout }) {
  const site = useSiteConfig();
  const today = getBusinessDate(useSaudiClock());
  const plan = useStudentPlan(studentId, today);
  const [planReady, setPlanReady] = useState(false);
  useEffect(() => { if (!plan.loading) setPlanReady(true); }, [plan.loading]);
  const [extras, setExtras] = useState(null);
  const [extrasReady, setExtrasReady] = useState(false);
  const [version, setVersion] = useState(0);
  const { view: requestedView, open: navigate, back } = useStudentHomeNavigation();
  const mobile = useMediaQuery('(max-width: 899px)');
  const [target, setTarget] = useState(null);

  const [sessionTab, setSessionTab] = useState('evaluation');
  const [openJuzs, setOpenJuzs] = useState({});
  const [sessionVisited, setSessionVisited] = useState(requestedView === 'sessions');
  useEffect(() => {
    let active = true;
    loadStudentHomeExtras({ showPath, showDailyChallenge, refresh: version > 0, onUpdate: (update) => { if (active) setExtras((current) => ({ ...current, ...update })); } }).then((data) => { if (active) { setExtras(data); setExtrasReady(true); } });
    return () => { active = false; };
  }, [showPath, showDailyChallenge, today, version]);
  const features = studentHomeFeatures(extras?.settings, site.features, { showPath, showDailyChallenge });
  const view = features[requestedView] ? requestedView : null;
  const open = (key) => { if (key === 'sessions') { setSessionVisited(true); }
    navigate(key); };
  const close = () => {
    back();
    if (['challenge', 'journey', 'sessions'].includes(view)) { setVersion((value) => value + 1); void plan.retry(); }
  };
  const read = (next) => { setTarget(next); navigate('mushaf'); };
  const leaveReader = back;
  const storeEnabled = features.store;
  const model = studentHomePlan(plan.data?.today, today, executionEnabled);
  const fullPage = ['mushaf', 'journey', 'challenge'].includes(view) || (view === 'programs' && !mobile);
  const entering = !planReady || !extrasReady;
  return <div className="student-home" dir="rtl">
    {entering && <LoadingIndicator mode="screen" delayMs={0} />}
    <div hidden={entering} inert={(mobile && view) || fullPage || view === 'store' ? '' : undefined}>
    <StudentHomeHeader showProgress={Boolean(plan.data?.today?.plan)} programsEnabled={features.programs} points={plan.data?.points?.total} progress={currentPlanProgress(plan.data?.today?.plan)} progressLabel="تقدم الخطة الحالية" storeEnabled={storeEnabled} onOpen={open} onLogout={onLogout} />
    <main className="student-home-main">
      <StudentNewsCard news={extras?.news} active={!entering && !view} />
      <StudentTodayCard studentId={studentId} executionEnabled={executionEnabled} model={model} loading={plan.loading && !plan.data} error={plan.error} onRetry={plan.retry} onRead={read} />
      {extras?.settingsError && <StudentHomeStatus message="تعذر تحديث إعدادات الصفحة." onRetry={() => setVersion((value) => value + 1)} />}
      {showPath && <StudentHomeJourney journey={studentJourneySummary(extras?.journey)} error={extras?.journeyError} onRetry={() => setVersion((value) => value + 1)} onOpen={() => open('journey')} />}
      {showDailyChallenge && <StudentHomeChallenge challenge={extras?.challenge} error={extras?.challengeError} onRetry={() => setVersion((value) => value + 1)} onOpen={() => open('challenge')} />}
      <StudentHomeRankings studentId={studentId} />
    </main></div>
    {!entering && !fullPage && <StudentBottomNavigation programsEnabled={features.programs} storeEnabled={storeEnabled} view={view} onNavigate={(key) => { if (key === view && key !== 'programs') { return; }
      if (key === 'mushaf') { read(null); } else { open(key); } }} />}
    {!entering && view && <StudentHomeWindow surfaceKey={view} title={titles[view]} onClose={view === 'mushaf' ? leaveReader : close} wide={['mushaf', 'journey', 'challenge', 'programs'].includes(view)} compact={view === 'calls'}>
      <PageLoadingBoundary key={view} scope="content"><Suspense fallback={<LoadingIndicator />}>
        {(view === 'sessions' || (view === 'mushaf' && sessionVisited)) && <div hidden={view !== 'sessions'}><Sessions studentId={studentId} plan={plan} today={today} onRead={read} tab={sessionTab} onTabChange={setSessionTab} openJuzs={openJuzs} onJuzToggle={setOpenJuzs} /></div>}
        {view === 'mushaf' && <Mushaf studentId={studentId} initialTarget={target} onBack={leaveReader} />}
        {view === 'store' && <Store embedded />}
        {view === 'programs' && <Programs embedded />}
        {view === 'calls' && <Calls />}
        {view === 'journey' && <Journey onBack={close} />}
        {view === 'challenge' && <Challenge onBack={close} />}
      </Suspense></PageLoadingBoundary>
    </StudentHomeWindow>}
  </div>;
}
