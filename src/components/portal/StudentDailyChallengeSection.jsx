import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Brain, CheckCircle2, Clock3, Sparkles, Trophy, Zap } from 'lucide-react';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import ClassicDailyChallengeGame from '@/components/portal/ClassicDailyChallengeGame';
import SummitMiniGame from '@/components/summit/SummitMiniGame';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { invalidateDailyChallengeCache } from '@/services/publicSettingsCache';
import {
  loadOfflineDailyChallenge,
  startOfflineDailyChallenge,
  submitOfflineDailyChallenge,
} from '@/services/offlineStudentService';
import { createDailyChallenge, getDailyChallengeGameLabel, isDailyChallengeCorrect } from '../../../shared/daily-challenge-engine.js';
import { SUMMIT_DAILY_CHALLENGE_GAME_TYPES } from '../../../shared/daily-challenge.js';
import { getBusinessDate } from '../../../shared/business-date.js';
import useRewardUnits from '@/hooks/useRewardUnits';
import './studentDailyChallenge.css';

const GAME_SECONDS = 60;
const getSaudiDate = getBusinessDate;

function ResultScreen({ result, onBack }) {
  const rewardUnits = useRewardUnits();
  return (
    <main className="daily-challenge-app">
      <div className="daily-challenge-ambient" aria-hidden="true" />
      <section className="daily-challenge-result">
        <div className="daily-challenge-icon-orbit">{result.correct ? <Trophy className="h-14 w-14 text-[#f2bd4f]" /> : <Clock3 className="h-14 w-14 text-white/70" />}</div>
        <h1>{result.pendingSync ? 'حُفظت محاولة اليوم' : (result.correct ? 'أحسنت، أنجزت تحدي اليوم!' : 'انتهت محاولة اليوم')}</h1>
        {result.pendingSync ? <p>ستُعتمد النتيجة تلقائيًا فور عودة الاتصال.</p> : null}
        {result.correct ? <div className="daily-challenge-points"><Zap className="h-5 w-5" /> +{rewardUnits.format(result.awardedPoints)}</div> : null}
        <Button type="button" onClick={onBack} className="daily-challenge-primary bg-[#d7a43b] !text-white">العودة</Button>
      </section>
    </main>
  );
}

function GameBoard({ attempt, onSubmit, disabled, rewardPoints = 0 }) {
  if (!SUMMIT_DAILY_CHALLENGE_GAME_TYPES.includes(attempt.gameType)) {
    return <ClassicDailyChallengeGame attempt={attempt} onSubmit={onSubmit} disabled={disabled} />;
  }
  const stage = {
    points: Math.max(0, Number(rewardPoints || 0)),
    duration: GAME_SECONDS,
    challenge: attempt.gameLabel,
  };
  return <SummitMiniGame attempt={{ stage, challenge: attempt.challenge }} title={attempt.gameLabel} onSubmit={onSubmit} isSubmitting={disabled} showRestart={false} showTimer={false} />;
}

export default function StudentDailyChallengeSection({ onBack, previewGameType = '', previewPoints = 0 }) {
  const rewardUnits = useRewardUnits();
  const { toast } = useToast();
  const previewMode = Boolean(previewGameType);
  const [data, setData] = useState(() => previewMode ? { points: Math.max(0, Number(previewPoints || 0)) } : null);
  const [attempt, setAttempt] = useState(() => previewMode ? {
    id: 0,
    gameType: previewGameType,
    gameLabel: getDailyChallengeGameLabel(previewGameType),
    status: 'started',
    challenge: createDailyChallenge(previewGameType),
  } : null);
  const [preparedAttempt, setPreparedAttempt] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(!previewMode);
  const [submitting, setSubmitting] = useState(false);
  const [seconds, setSeconds] = useState(GAME_SECONDS);
  const timeoutSent = useRef(false);

  const loadChallenge = useCallback(async () => {
    if (previewMode) return;
    try {
      const studentId = Number(localStorage.getItem('wajeh_student_id') || 0);
      const response = await loadOfflineDailyChallenge(studentId);
      if (!response) throw new Error('لا يوجد تحدٍ مجهز لهذا اليوم.');
      setData(response);
      setPreparedAttempt(response.attempt?.status === 'started' ? response.attempt : null);
      setAttempt(null);
      setResult(response.attempt && response.attempt.status !== 'started'
        ? {
            correct: response.attempt.status === 'completed',
            awardedPoints: response.attempt.pointsAwarded,
            pendingSync: response.attempt.status === 'pending_sync',
          } : null);
      setSeconds(GAME_SECONDS);
      timeoutSent.current = false;
    } catch (error) {
      toast({ title: 'تعذر تحميل التحدي', description: error.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [previewMode, toast]);

  useEffect(() => { loadChallenge(); }, [loadChallenge]);
  useEffect(() => {
    if (previewMode) return undefined;
    const midnightWatcher = window.setInterval(() => {
      if (data?.date && data.date !== getSaudiDate()) {
        invalidateDailyChallengeCache();
        loadChallenge();
      }
    }, 1000);
    return () => window.clearInterval(midnightWatcher);
  }, [data?.date, loadChallenge, previewMode]);

  const submit = useCallback(async (payload) => {
    if (submitting || result) return;
    setSubmitting(true);
    try {
      if (previewMode) {
        const correct = isDailyChallengeCorrect(attempt.gameType, attempt.challenge, payload);
        setResult({ correct, awardedPoints: correct ? Math.max(0, Number(previewPoints || 0)) : 0 });
      } else {
        const studentId = Number(localStorage.getItem('wajeh_student_id') || 0);
        setResult(await submitOfflineDailyChallenge(studentId, payload));
        invalidateDailyChallengeCache();
      }
    } catch (error) {
      toast({ title: 'تعذر إنهاء التحدي', description: error.message, variant: 'destructive' });
    } finally { setSubmitting(false); }
  }, [attempt, previewMode, previewPoints, result, submitting, toast]);

  useEffect(() => {
    if (!attempt || result) return undefined;
    const timer = window.setInterval(() => setSeconds((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [attempt, result]);
  useEffect(() => {
    if (seconds !== 0 || !attempt || result || timeoutSent.current) return;
    timeoutSent.current = true;
    submit({ failed: true });
  }, [attempt, result, seconds, submit]);

  const pointsText = useMemo(() => data?.points > 0 ? rewardUnits.format(data.points) : 'بدون مكافأة', [data, rewardUnits]);
  if (loading) return <DashboardLoader className="h-dvh bg-[#001f2d]" />;
  if (result) return <ResultScreen result={result} onBack={onBack} />;

  return (
    <main className="daily-challenge-app">
      <div className="daily-challenge-ambient" aria-hidden="true" />
      <header className="daily-challenge-header">
        <button type="button" onClick={onBack} aria-label="العودة"><ArrowRight /></button>
        <div><Trophy /><span>التحدي اليومي</span></div>
        <div className="daily-challenge-reward"><Zap /> {pointsText}</div>
      </header>
      {!attempt ? (
        <section className="daily-challenge-hero">
          <Sparkles className="daily-challenge-spark" />
          <div className="daily-challenge-icon-orbit"><Brain className="h-14 w-14 text-[#f2bd4f]" /></div>
          <div><span className="daily-challenge-kicker">مهمة جديدة كل يوم</span><h1>اختبر سرعتك وتركيزك</h1><p>لعبة جديدة كل يوم، ولديك محاولة واحدة و60 ثانية فقط.</p></div>
          <Button type="button" disabled={submitting} className="daily-challenge-primary bg-[#d7a43b] !text-white" onClick={async () => {
            setSubmitting(true);
            try {
              const studentId = Number(localStorage.getItem('wajeh_student_id') || 0);
              const nextAttempt = preparedAttempt || await startOfflineDailyChallenge(studentId, data);
              invalidateDailyChallengeCache();
              setPreparedAttempt(nextAttempt);
              setAttempt(nextAttempt);
              setSeconds(GAME_SECONDS);
            }
            catch (error) { toast({ title: 'تعذر بدء التحدي', description: error.message, variant: 'destructive' }); }
            finally { setSubmitting(false); }
          }}>ابدأ التحدي <Zap className="h-5 w-5" /></Button>
        </section>
      ) : (
        <section className="daily-challenge-game">
          <div className="daily-challenge-game-title"><div><span>تحدي اليوم</span><h1>{attempt.gameLabel}</h1></div><div className="daily-challenge-timer" dir="ltr"><Clock3 /><b>{seconds}</b></div></div>
          <div className="daily-challenge-board"><GameBoard attempt={attempt} onSubmit={submit} disabled={submitting} rewardPoints={data?.points} /></div>
          {submitting ? <div className="daily-challenge-submitting"><CheckCircle2 /> جارٍ اعتماد النتيجة</div> : null}
        </section>
      )}
    </main>
  );
}
