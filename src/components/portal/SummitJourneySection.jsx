import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BellRing, Flag, Navigation, Trophy } from 'lucide-react';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import LoadingSpinner from '@/components/ui/loading-spinner';
import SummitJourneyMap from '@/components/summit/SummitJourneyMap';
import SummitMiniGame from '@/components/summit/SummitMiniGame';
import ClassicDailyChallengeGame from '@/components/portal/ClassicDailyChallengeGame';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { studentsApi } from '@/services/studentsApi';
import { getTenantRegistrationNumber } from '@/services/apiBase';
import { claimSummitArrival } from '@/lib/summitArrivalNotice';
import {
  getSummitJourneyCached,
  invalidateSummitJourneyCache,
} from '@/services/publicSettingsCache';
import { getNextSummitBlockingStation } from '../../../shared/summit-map.js';
import { SUMMIT_DAILY_CHALLENGE_GAME_TYPES } from '../../../shared/daily-challenge.js';
import './studentDailyChallenge.css';

const movementDuration = (distance) => Math.min(7000, Math.max(1200, distance * 9));
const getArrivalTitle = (stage) => {
  if (stage?.locationType === 'station') return `لقد وصلت إلى محطة ${stage.name}`;
  if (stage?.locationType === 'city') return `لقد وصلت إلى مدينة ${stage.name}`;
  return stage?.name;
};

const SummitJourneySection = ({ onBack }) => {
  const { toast } = useToast();
  const [journey, setJourney] = useState(null);
  const [displayedKilometers, setDisplayedKilometers] = useState(0);
  const [activeStation, setActiveStation] = useState(null);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [result, setResult] = useState(null);
  const [isMoving, setIsMoving] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const animationRef = useRef(0);
  const stationRefreshErrorShownRef = useRef(false);
  const announceArrival = useCallback((stage, requiresContinuation = false) => {
    const scope = `${getTenantRegistrationNumber() || 'default'}:${localStorage.getItem('wajeh_student_id') || ''}`;
    // A seen notice is not an acknowledgement; reopening must retain the way forward.
    if (claimSummitArrival(scope, stage) || requiresContinuation) setNotificationOpen(true);
  }, []);

  useEffect(() => {
    let mounted = true;
    getSummitJourneyCached({ refresh: true })
      .then((data) => {
        if (!mounted) return;
        setJourney(data);
        const initialKilometers = Number(data.activeStation?.kilometer ?? data.displayedKilometers ?? data.points ?? 0);
        setDisplayedKilometers(initialKilometers);
        const initialStage = data.stages.find((stage) => (
          Number(stage.points) === initialKilometers
          && !stage.completed
          && (
            stage.locationType === 'station'
            || stage.locationType === 'city'
            || stage.notificationEnabled
            || stage.challengeEnabled
          )
        ));
        if (initialStage) {
          setActiveStation(initialStage);
          if (['station', 'city'].includes(initialStage.locationType) || initialStage.notificationEnabled) announceArrival(initialStage, !data.activeStation);
          else setSelectedStage(initialStage);
        }
      })
      .catch((error) => toast({ title: 'تعذر فتح رحلة القمّة', description: error.message, variant: 'destructive' }));
    return () => {
      mounted = false;
      window.cancelAnimationFrame(animationRef.current);
    };
  }, [toast, announceArrival]);

  useEffect(() => {
    if (!journey) return undefined;
    let mounted = true;
    const refreshActiveStation = async () => {
      try {
        const data = await getSummitJourneyCached({ refresh: true });
        if (!mounted) return;
        stationRefreshErrorShownRef.current = false;
        const previousId = journey.mapConfig?.activeStationId || null;
        const nextId = data.mapConfig?.activeStationId || null;
        if (previousId === nextId) {
          setJourney(data);
          return;
        }
        window.cancelAnimationFrame(animationRef.current);
        setIsMoving(false);
        setJourney(data);
        setDisplayedKilometers(Number(data.activeStation?.kilometer ?? data.displayedKilometers ?? data.points ?? 0));
        if (data.activeStation) {
          const stage = data.stages.find(({ id }) => id === data.activeStation.id) || data.activeStation;
          setActiveStation(stage);
          announceArrival(stage);
        } else {
          setActiveStation(null);
          setSelectedStage(null);
          setNotificationOpen(false);
        }
      } catch (error) {
        if (mounted && !stationRefreshErrorShownRef.current) {
          stationRefreshErrorShownRef.current = true;
          toast({ title: 'تعذر تحديث حالة المحطة', description: error.message, variant: 'destructive' });
        }
      }
    };
    const timer = window.setInterval(refreshActiveStation, 20_000);
    window.addEventListener('focus', refreshActiveStation);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshActiveStation);
    };
  }, [journey, toast, announceArrival]);

  const saveDisplayedProgress = useCallback(async (kilometers) => {
    const normalized = Math.max(0, Math.trunc(Number(kilometers) || 0));
    setDisplayedKilometers(normalized);
    setJourney((current) => current ? { ...current, displayedKilometers: normalized } : current);
    try {
      await studentsApi.updateSummitProgress(normalized);
    } catch (error) {
      toast({ title: 'تعذر حفظ موضع الرحلة', description: error.message, variant: 'destructive' });
    }
  }, [toast]);

  useEffect(() => {
    if (!journey || journey.activeStation || isMoving || activeStation || selectedStage || attempt || result) return undefined;
    const finalTarget = Number(journey.points || 0);
    if (displayedKilometers === finalTarget) return undefined;
    const movingForward = displayedKilometers < finalTarget;
    const blockingStation = movingForward ? getNextSummitBlockingStation(
      journey.stages,
      displayedKilometers,
      finalTarget,
    ) : null;
    const target = Number(blockingStation?.points || finalTarget);
    const from = displayedKilometers;
    const startedAt = performance.now();
    const duration = movementDuration(Math.abs(target - from));
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setIsMoving(true);

    const animate = (now) => {
      const ratio = reducedMotion ? 1 : Math.min(1, (now - startedAt) / duration);
      const eased = 1 - ((1 - ratio) ** 3);
      setDisplayedKilometers(Math.round(from + ((target - from) * eased)));
      if (ratio < 1) {
        animationRef.current = window.requestAnimationFrame(animate);
        return;
      }
      setIsMoving(false);
      if (blockingStation) {
        setActiveStation(blockingStation);
        if (['station', 'city'].includes(blockingStation.locationType) || blockingStation.notificationEnabled) announceArrival(blockingStation, true);
        else setSelectedStage(blockingStation);
      } else {
        void saveDisplayedProgress(target);
      }
    };
    animationRef.current = window.requestAnimationFrame(animate);
    return undefined;
  }, [activeStation, attempt, displayedKilometers, isMoving, journey, result, saveDisplayedProgress, selectedStage, announceArrival]);

  const continueAfterNotification = async () => {
    setNotificationOpen(false);
    if (activeStation?.challengeEnabled && !activeStation.completed) {
      setSelectedStage(activeStation);
      return;
    }
    if (journey?.activeStation) {
      setActiveStation(null);
      return;
    }
    if (
      !activeStation?.challengeEnabled
      && (['station', 'city'].includes(activeStation?.locationType) || activeStation?.notificationEnabled)
    ) {
      try {
        await studentsApi.acknowledgeSummitStage(activeStation.points);
        setJourney((current) => current ? {
          ...current,
          stages: current.stages.map((stage) => (
            Number(stage.points) === Number(activeStation.points) ? { ...stage, completed: true } : stage
          )),
        } : current);
      } catch (error) {
        toast({ title: 'تعذر حفظ الوصول', description: error.message, variant: 'destructive' });
        return;
      }
    }
    await saveDisplayedProgress(activeStation?.points ?? displayedKilometers);
    setActiveStation(null);
  };

  const openStation = (stage) => {
    if (!['station', 'city'].includes(stage.locationType) && !stage.notificationEnabled && !stage.challengeEnabled) return;
    setActiveStation(stage);
    setResult(null);
    if (['station', 'city'].includes(stage.locationType) || stage.notificationEnabled) setNotificationOpen(true);
    else if (stage.challengeEnabled) setSelectedStage(stage);
  };

  const startStage = async () => {
    if (!selectedStage?.challengeEnabled) return;
    setIsStarting(true);
    try {
      setAttempt(await studentsApi.startSummitStage(selectedStage.points));
      setResult(null);
    } catch (error) {
      toast({ title: 'تعذر بدء التحدي', description: error.message, variant: 'destructive' });
    } finally { setIsStarting(false); }
  };

  const submitAttempt = async (answer) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const data = await studentsApi.submitSummitAttempt(attempt.attemptId, answer);
      invalidateSummitJourneyCache();
      setResult(data);
      setAttempt(null);
      try {
        setJourney(await getSummitJourneyCached({ refresh: true }));
      } catch {
        toast({ title: 'حُفظت نتيجة التحدي', description: 'تعذر تحديث الخريطة الآن، وستظهر النتيجة عند فتحها مجددًا.' });
      }
    } catch (error) {
      toast({ title: 'تعذر حفظ نتيجة التحدي', description: error.message, variant: 'destructive' });
    } finally { setIsSubmitting(false); }
  };

  const continueAfterChallenge = async () => {
    if (!journey?.activeStation) {
      await saveDisplayedProgress(activeStation?.points ?? selectedStage?.points ?? displayedKilometers);
    }
    setResult(null);
    setSelectedStage(null);
    setActiveStation(null);
  };

  const visibleJourney = useMemo(() => {
    if (!journey) return null;
    return {
      ...journey,
      points: displayedKilometers,
      isMoving,
      nextStage: journey.stages.find((stage) => stage.points > displayedKilometers) || null,
      reachedSummit: Boolean(journey.mapConfig?.goal?.enabled)
        && displayedKilometers >= Number(journey.totalKilometers || 8000),
    };
  }, [displayedKilometers, isMoving, journey]);

  if (!visibleJourney) return <DashboardLoader className="fixed inset-0 z-[90] min-h-dvh bg-[#d9c7a5]" />;
  return (
    <div className="fixed inset-0 z-[90] h-dvh overflow-hidden bg-[#d9c7a5] [font-family:var(--font-ui)]" dir="rtl">
      <Button variant="ghost" size="icon" className="absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)] z-[140] h-12 w-12 touch-manipulation rounded-full border border-white/45 bg-[#143043]/90 p-0 text-white shadow-lg backdrop-blur-md hover:bg-[#173c54] hover:text-white sm:right-6" onClick={onBack} aria-label="الرجوع" title="الرجوع"><ArrowRight className="h-5 w-5" aria-hidden="true" /></Button>
      <SummitJourneyMap journey={visibleJourney} onStageClick={openStation} />

      {visibleJourney.reachedSummit && (
        <div className="absolute inset-0 z-[150] grid place-items-center overflow-hidden bg-[#102b3c]/88 p-5 text-center backdrop-blur" role="dialog" aria-label="الوصول إلى النهاية">
          <div className="relative max-w-lg rounded-[2rem] border border-white/60 bg-white p-8 text-slate-900 shadow-2xl"><Flag className="mx-auto h-16 w-16 text-primary" /><h2 className="mt-4 text-3xl font-black">وصلت إلى {journey.mapConfig.goal.name}</h2><p className="mt-3 text-slate-600">أكملت الرحلة وقطعت {Number(journey.totalKilometers).toLocaleString('ar-SA-u-nu-latn')} كيلومتر.</p><Button className="mt-6" onClick={onBack}>العودة للرئيسية</Button></div>
        </div>
      )}

      <Dialog open={notificationOpen} onOpenChange={() => {}}>
        <DialogContent overlayClassName="z-[150]" className="z-[160] max-w-sm border-[var(--brand-navigation-highlight)] bg-[#fffaf0] text-center [font-family:var(--font-ui)]" dir="rtl">
          <BellRing className="mx-auto h-14 w-14 text-[var(--brand-navigation-highlight)]" />
          <DialogHeader>
            <DialogTitle className="text-center text-2xl font-black text-[#6f4d11]">
              {getArrivalTitle(activeStation)}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm font-bold leading-7 text-slate-600">
            {activeStation?.notificationEnabled
              ? activeStation.notificationText
              : 'يمكنك الآن متابعة الطريق.'}
          </p>
          <Button className="h-12 w-full bg-[var(--brand-navigation-highlight)] text-white hover:brightness-90" onClick={continueAfterNotification}>{activeStation?.challengeEnabled && !activeStation?.completed ? 'الانتقال إلى التحدي' : 'متابعة الطريق'}</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedStage && !attempt && !result)} onOpenChange={(open) => { if (!open && !activeStation) setSelectedStage(null); }}>
        <DialogContent overlayClassName="z-[150]" className="z-[160] max-w-md [font-family:var(--font-ui)]" dir="rtl">
          <DialogHeader><DialogTitle className="text-center text-2xl font-black">{selectedStage?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 text-center"><p className="text-muted-foreground">وصلت إلى {selectedStage?.name} عند {selectedStage?.points.toLocaleString('ar-SA-u-nu-latn')} كم. أكمل التحدي لتحصل على مكافأة الفوز بالتحدي: {Number(selectedStage?.rewardPoints ?? journey.challengeMaxPoints).toLocaleString('ar-SA-u-nu-latn')} كم.</p>{selectedStage?.completed && <p className="rounded-xl bg-primary/10 p-3 text-sm font-bold text-primary">أنهيت هذا التحدي سابقًا.</p>}<Button className="h-12 w-full" disabled={isStarting} onClick={startStage}>{isStarting ? <LoadingSpinner size="md" /> : 'ابدأ التحدي'}</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(attempt)} onOpenChange={(open) => !open && setAttempt(null)}>
        <DialogContent overlayClassName="z-[150]" className="z-[160] max-h-[94dvh] max-w-xl overflow-y-auto bg-[#001f2d] [font-family:var(--font-ui)]" dir="rtl">
          {SUMMIT_DAILY_CHALLENGE_GAME_TYPES.includes(attempt?.gameType) ? (
            <SummitMiniGame attempt={attempt} onSubmit={submitAttempt} isSubmitting={isSubmitting} />
          ) : (
            <div className="daily-challenge-board text-white">
              <ClassicDailyChallengeGame attempt={attempt} onSubmit={submitAttempt} disabled={isSubmitting} />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(result)} onOpenChange={(open) => !open && setResult(null)}>
        <DialogContent overlayClassName="z-[150]" className="z-[160] max-w-sm text-center [font-family:var(--font-ui)]" dir="rtl"><div className="space-y-4 py-4">{result?.completed ? <Trophy className="mx-auto h-14 w-14 text-primary" /> : <Navigation className="mx-auto h-14 w-14 text-muted-foreground" />}<h2 className="text-2xl font-black">{result?.completed ? 'اكتمل التحدي' : 'المحاولة غير مكتملة'}</h2><p className="text-muted-foreground">{result?.completed ? `حصلت على ${result.awardedPoints} كم.` : 'أعد المحاولة وحاول إكمال التحدي.'}</p><Button className="w-full" onClick={() => { if (result?.completed) void continueAfterChallenge(); else { setResult(null); void startStage(); } }}>{result?.completed ? 'متابعة الرحلة' : 'إعادة المحاولة'}</Button></div></DialogContent>
      </Dialog>
    </div>
  );
};

export default SummitJourneySection;
