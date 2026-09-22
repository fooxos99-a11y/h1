import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit3, LockKeyhole, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import { DashboardDatePicker } from '@/components/dashboard/DashboardControls';
import ManagementIconButton from '@/components/ui/management-icon-button';
import AyahSearchSelect from '@/components/quran/AyahSearchSelect';
import SurahSearchSelect from '@/components/quran/SurahSearchSelect';
import { countExpectedMemorizationDays } from '@/lib/quranPlanPreview';
import { loadOfflineSnapshot } from '@/services/offlineOperationsService';
import { studentsApi } from '@/services/studentsApi';
import { nazemIntegrationApi } from '@/services/nazemIntegrationApi';
import { getBusinessDate } from '../../../shared/business-date.js';

const getAccountId = () => Number(localStorage.getItem('wajeh_supervisor_id') || 0);

const emptyForm = {
  track: 'memorization',
  startDate: '',
  startSurah: '',
  startAyah: '',
  startPage: '',
  endSurah: '',
  endAyah: '',
  endPage: '',
  dailyPreset: '1',
  dailyPages: 1,
  linkPreset: '10',
  linkPages: 10,
  reviewPreset: '20',
  reviewPages: 20,
  reviewSplitWeekly: false,
  reviewWeekStartDay: '0',
  reviewWeekEndDay: '6',
  reviewMinDailyPages: 1,
  priorMemorization: [],
};

const weekDays = [
  ['0', 'الأحد'],
  ['1', 'الاثنين'],
  ['2', 'الثلاثاء'],
  ['3', 'الأربعاء'],
  ['4', 'الخميس'],
  ['5', 'الجمعة'],
  ['6', 'السبت'],
];

const quranPlanTracks = [
  ['memorization', 'حفظ'],
  ['mastery', 'إتقان'],
];
const numberText = (value) => Number(value || 0).toLocaleString('ar-SA-u-nu-latn');

const today = getBusinessDate;

const getPagesValue = (preset, custom, min = 1) => {
  if (preset === 'weekly') return Math.max(1, Number(custom || 20));
  if (preset === 'custom') return Math.max(min, Number(custom || min));
  return Number(preset || 1);
};

const getWeekDaysBetween = (startDay, endDay) => {
  const start = Number(startDay);
  const end = Number(endDay);
  const days = [start];
  let cursor = start;
  while (cursor !== end && days.length < 7) {
    cursor = (cursor + 1) % 7;
    days.push(cursor);
  }
  return days;
};

const countReviewDays = (startDay, endDay, holidays, allowedHolidayTasks = []) => {
  const reviewAllowedOnHoliday = Array.isArray(allowedHolidayTasks) && allowedHolidayTasks.includes('review');
  const _resolveHolidaySet = () => {
    if (reviewAllowedOnHoliday) {
      return [];
    }
    return (Array.isArray(holidays) ? holidays : [5, 6]).map(Number);
  };
  const holidaySet = new Set(_resolveHolidaySet());
  return getWeekDaysBetween(startDay, endDay).filter((day) => !holidaySet.has(day)).length;
};

const getPriorPageRanges = (items = []) => items
  .map((item) => {
    const startPage = Number(item.startPage || 0);
    const endPage = Number(item.endPage || 0);
    return { startPage: Math.min(startPage, endPage), endPage: Math.max(startPage, endPage) };
  })
  .filter((item) => item.startPage && item.endPage);

const pageInRanges = (page, ranges) => ranges.some((range) => Number(page) >= range.startPage && Number(page) <= range.endPage);

const rangesOverlap = (a, b) => a.startPage <= b.endPage && b.startPage <= a.endPage;

const rangeCoversRange = (target, ranges) => ranges.some((range) => range.startPage <= target.startPage && range.endPage >= target.endPage);

const countUnblockedPages = (startPage, endPage, blockedRanges) => {
  let count = 0;
  const firstPage = Math.min(Number(startPage), Number(endPage));
  const lastPage = Math.max(Number(startPage), Number(endPage));
  for (let page = firstPage; page <= lastPage; page += 1) {
    if (!pageInRanges(page, blockedRanges)) count += 1;
  }
  return count;
};

const countUnblockedQuranPlanPages = ({ startAyah, endAyah, startChapter, endChapter, chapters, blockedRanges }) => {
  if (!startAyah || !endAyah) return 0;
  if (Number(startChapter?.number) <= Number(endChapter?.number)) {
    return countUnblockedPages(startAyah.page, endAyah.page, blockedRanges);
  }
  const pages = new Set();
  chapters
    .filter((chapter) => Number(chapter.number) <= Number(startChapter.number) && Number(chapter.number) >= Number(endChapter.number))
    .forEach((chapter) => {
      const firstPage = Number(chapter.number) === Number(startChapter.number)
        ? Number(startAyah.page)
        : Number(chapter.startPage);
      const lastPage = Number(chapter.number) === Number(endChapter.number)
        ? Number(endAyah.page)
        : Number(chapter.endPage);
      for (let page = firstPage; page <= lastPage; page += 1) pages.add(page);
    });
  return [...pages].filter((page) => !pageInRanges(page, blockedRanges)).length;
};

const compareQuranRefs = (aSurah, aAyah, bSurah, bAyah) => {
  if (Number(aSurah) !== Number(bSurah)) return Number(aSurah) - Number(bSurah);
  return Number(aAyah) - Number(bAyah);
};

const normalizeQuranRefRange = (range) => {
  const first = { surah: Number(range?.startSurah || 0), ayah: Number(range?.startAyah || 0) };
  const last = { surah: Number(range?.endSurah || 0), ayah: Number(range?.endAyah || 0) };
  if (!first.surah || !first.ayah || !last.surah || !last.ayah) return null;
  return compareQuranRefs(first.surah, first.ayah, last.surah, last.ayah) <= 0
    ? { first, last }
    : { first: last, last: first };
};

const quranRefInRanges = (surah, ayah, ranges) => ranges.some((range) => {
  const normalized = normalizeQuranRefRange(range);
  if (!normalized) return false;
  return compareQuranRefs(surah, ayah, normalized.first.surah, normalized.first.ayah) >= 0
    && compareQuranRefs(surah, ayah, normalized.last.surah, normalized.last.ayah) <= 0;
});

const quranRangesOverlap = (firstRange, secondRange) => {
  const first = normalizeQuranRefRange(firstRange);
  const second = normalizeQuranRefRange(secondRange);
  if (!first || !second) return false;
  return compareQuranRefs(first.first.surah, first.first.ayah, second.last.surah, second.last.ayah) <= 0
    && compareQuranRefs(second.first.surah, second.first.ayah, first.last.surah, first.last.ayah) <= 0;
};

const StudentPlansSection = ({ hideCommitteeFilter = false }) => {
  const { toast } = useToast();
  const [committeeId, setCommitteeId] = useState('all');
  const [committees, setCommittees] = useState([]);
  const [rows, setRows] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [juzRanges, setJuzRanges] = useState([]);
  const [startAyahs, setStartAyahs] = useState([]);
  const [endAyahs, setEndAyahs] = useState([]);
  const [weeklyHolidayDays, setWeeklyHolidayDays] = useState([5, 6]);
  const [selectedRow, setSelectedRow] = useState(null);
  const [memorizedRow, setMemorizedRow] = useState(null);
  const [deletePlanRow, setDeletePlanRow] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [priorDialogOpen, setPriorDialogOpen] = useState(false);
  const [confirmPlanSaveOpen, setConfirmPlanSaveOpen] = useState(false);
  const [priorForm, setPriorForm] = useState({ startSurah: '', startAyah: '', startPage: '', endSurah: '', endAyah: '', endPage: '' });
  const [priorStartAyahs, setPriorStartAyahs] = useState([]);
  const [priorEndAyahs, setPriorEndAyahs] = useState([]);
  const [holidayTaskTypes, setHolidayTaskTypes] = useState([]);
  const [quranReferenceMode, setQuranReferenceMode] = useState('ayah');
  const [minimumPlanStartDate, setMinimumPlanStartDate] = useState(today);
  const [isCreatingNewPlan, setIsCreatingNewPlan] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingMemorized, setIsDeletingMemorized] = useState(false);
  const [isDeletingPlan, setIsDeletingPlan] = useState(false);
  const keepPlanDialogOpen = (event) => event.preventDefault();

  const startAyah = startAyahs.find((ayah) => String(ayah.ayah) === String(form.startAyah));
  const endAyah = endAyahs.find((ayah) => String(ayah.ayah) === String(form.endAyah));
  const startChapter = chapters.find((chapter) => String(chapter.number) === String(form.startSurah));
  const endChapter = chapters.find((chapter) => String(chapter.number) === String(form.endSurah));
  const savedPriorMemorization = useMemo(
    () => selectedRow?.plan?.priorMemorization || [],
    [selectedRow]
  );
  const stagedPriorPageRanges = useMemo(() => getPriorPageRanges(form.priorMemorization), [form.priorMemorization]);
  const savedPriorPageRanges = useMemo(
    () => getPriorPageRanges(savedPriorMemorization),
    [savedPriorMemorization]
  );
  const completedPageRanges = useMemo(
    () => getPriorPageRanges(selectedRow?.plan?.completedMemorization || []),
    [selectedRow]
  );
  const unavailableQuranRanges = useMemo(
    () => [
      ...savedPriorMemorization,
      ...(form.priorMemorization || []),
      ...(selectedRow?.plan?.completedMemorization || []),
    ],
    [form.priorMemorization, savedPriorMemorization, selectedRow]
  );
  const unavailablePageRanges = useMemo(
    () => [...savedPriorPageRanges, ...stagedPriorPageRanges, ...completedPageRanges],
    [completedPageRanges, savedPriorPageRanges, stagedPriorPageRanges]
  );
  const currentPlanBoundaryPages = useMemo(() => new Set(
    !isCreatingNewPlan && selectedRow?.plan
      ? [selectedRow.plan.startPage, selectedRow.plan.endPage].filter(Boolean).map(String)
      : []
  ), [isCreatingNewPlan, selectedRow]);
  const availablePlanPages = useMemo(
    () => quranPages.filter((page) => (
      currentPlanBoundaryPages.has(String(page)) || !pageInRanges(page, unavailablePageRanges)
    )),
    [currentPlanBoundaryPages, unavailablePageRanges]
  );
  const availableChapters = useMemo(() => chapters.filter((chapter) => {
    const startPage = Number(chapter.startPage || 0);
    const endPage = Number(chapter.endPage || 0);
    if (!startPage || !endPage) return true;
    return !rangeCoversRange({ startPage, endPage }, unavailablePageRanges);
  }), [chapters, unavailablePageRanges]);
  const startAyahOptions = useMemo(
    () => startAyahs.filter((ayah) => !quranRefInRanges(form.startSurah, ayah.ayah, unavailableQuranRanges)),
    [form.startSurah, startAyahs, unavailableQuranRanges]
  );
  const endAyahOptions = useMemo(
    () => endAyahs.filter((ayah) => !quranRefInRanges(form.endSurah, ayah.ayah, unavailableQuranRanges)),
    [endAyahs, form.endSurah, unavailableQuranRanges]
  );
  const priorStartAyahOptions = useMemo(
    () => priorStartAyahs.filter((ayah) => !quranRefInRanges(priorForm.startSurah, ayah.ayah, unavailableQuranRanges)),
    [priorForm.startSurah, priorStartAyahs, unavailableQuranRanges]
  );
  const priorEndAyahOptions = useMemo(
    () => priorEndAyahs.filter((ayah) => !quranRefInRanges(priorForm.endSurah, ayah.ayah, unavailableQuranRanges)),
    [priorEndAyahs, priorForm.endSurah, unavailableQuranRanges]
  );

  const preview = useMemo(() => {
    if (quranReferenceMode === 'page') {
      const startPage = Number(form.startPage || 0);
      const endPage = Number(form.endPage || 0);
      if (!startPage || !endPage) return null;
      const pages = countUnblockedPages(startPage, endPage, unavailablePageRanges);
      const dailyPages = getPagesValue(form.dailyPreset, form.dailyPages, 0.25);
      const reviewDays = countReviewDays(form.reviewWeekStartDay, form.reviewWeekEndDay, weeklyHolidayDays, holidayTaskTypes);
      if (startPage < 1 || startPage > 604 || endPage < 1 || endPage > 604) return { error: 'بداية الخطة ونهايتها يجب أن تكونا ضمن صفحات المصحف.' };
      if (form.reviewSplitWeekly && reviewDays < 1) return { error: 'اختر أيام مراجعة لا تكون كلها ضمن الإجازة الأسبوعية.' };
      return {
        pages,
        dailyPages,
        linkPages: getPagesValue(form.linkPreset, form.linkPages),
        reviewPages: getPagesValue(form.reviewPreset, form.reviewPages),
        reviewDailyPages: form.reviewSplitWeekly
          ? Math.max(
            Math.ceil(getPagesValue(form.reviewPreset, form.reviewPages) / reviewDays),
            Number(form.reviewMinDailyPages || 1)
          )
          : getPagesValue(form.reviewPreset, form.reviewPages),
        days: countExpectedMemorizationDays({ pages, dailyPages }),
      };
    }
    if (!startAyah || !endAyah) return null;
    const pages = countUnblockedQuranPlanPages({
      startAyah,
      endAyah,
      startChapter,
      endChapter,
      chapters,
      blockedRanges: unavailablePageRanges,
    });
    const dailyPages = getPagesValue(form.dailyPreset, form.dailyPages, 0.25);
    const reviewDays = countReviewDays(form.reviewWeekStartDay, form.reviewWeekEndDay, weeklyHolidayDays, holidayTaskTypes);
    if (form.reviewSplitWeekly && reviewDays < 1) return { error: 'اختر أيام مراجعة لا تكون كلها ضمن الإجازة الأسبوعية.' };
    return {
      pages,
      dailyPages,
      linkPages: getPagesValue(form.linkPreset, form.linkPages),
      reviewPages: getPagesValue(form.reviewPreset, form.reviewPages),
      reviewDailyPages: form.reviewSplitWeekly
        ? Math.max(
          Math.ceil(getPagesValue(form.reviewPreset, form.reviewPages) / reviewDays),
          Number(form.reviewMinDailyPages || 1)
        )
        : getPagesValue(form.reviewPreset, form.reviewPages),
      days: countExpectedMemorizationDays({ pages, dailyPages }),
    };
  }, [chapters, endAyah, endChapter, form.dailyPages, form.dailyPreset, form.endPage, form.linkPages, form.linkPreset, form.reviewMinDailyPages, form.reviewPages, form.reviewPreset, form.reviewSplitWeekly, form.reviewWeekEndDay, form.reviewWeekStartDay, form.startPage, holidayTaskTypes, quranReferenceMode, startAyah, startChapter, unavailablePageRanges, weeklyHolidayDays]);

  const loadRows = useCallback(async () => {
    setIsLoading(true);
    try {
      await nazemIntegrationApi.importReadyPlans().catch(() => null);
      const [families, planRows, quranChapters, quranJuzRanges, publicSettings] = await Promise.all([
        hideCommitteeFilter ? Promise.resolve([]) : loadOfflineSnapshot(getAccountId(), 'plans:committees', () => studentsApi.getCommittees()),
        loadOfflineSnapshot(getAccountId(), `plans:rows:${committeeId}`, () => studentsApi.getStudentPlans({ committeeId })),
        loadOfflineSnapshot(getAccountId(), 'quran:chapters', () => studentsApi.getQuranChapters()),
        loadOfflineSnapshot(getAccountId(), 'quran:juz-ranges', () => studentsApi.getQuranJuzRanges()),
        loadOfflineSnapshot(getAccountId(), 'settings:public', () => studentsApi.getPublicSettings()),
      ]);
      setCommittees(families);
      setRows(planRows);
      setChapters(quranChapters);
      setJuzRanges(quranJuzRanges);
      if (Array.isArray(publicSettings?.weeklyHolidayDays)) setWeeklyHolidayDays(publicSettings.weeklyHolidayDays);
      if (Array.isArray(publicSettings?.holidayTaskTypes)) setHolidayTaskTypes(publicSettings.holidayTaskTypes);
      setQuranReferenceMode(publicSettings?.quranReferenceMode === 'page' ? 'page' : 'ayah');
      const currentDate = today();
      setMinimumPlanStartDate(
        publicSettings?.currentTermStartDate && publicSettings.currentTermStartDate > currentDate
          ? publicSettings.currentTermStartDate
          : currentDate
      );
    } catch (error) {
      toast({ title: 'تعذر تحميل خطط الطلاب', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [committeeId, hideCommitteeFilter, toast]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    if (!form.startSurah) {
      setStartAyahs([]);
      return;
    }
    loadOfflineSnapshot(getAccountId(), `quran:ayahs:${form.startSurah}`, () => studentsApi.getQuranAyahs(form.startSurah))
      .then(setStartAyahs).catch(() => setStartAyahs([]));
  }, [form.startSurah]);

  useEffect(() => {
    if (!form.endSurah) {
      setEndAyahs([]);
      return;
    }
    loadOfflineSnapshot(getAccountId(), `quran:ayahs:${form.endSurah}`, () => studentsApi.getQuranAyahs(form.endSurah))
      .then(setEndAyahs).catch(() => setEndAyahs([]));
  }, [form.endSurah]);

  const openPlanDialog = (row, { createNew = false } = {}) => {
    const plan = row.plan;
    setSelectedRow(row);
    setIsCreatingNewPlan(createNew);
    const _resolveReviewPreset = () => {
      if (plan.reviewSplitWeekly) {
        return 'weekly';
      }
      if (['20', '40', '60'].includes(String(plan.reviewPages))) {
        return String(plan.reviewPages);
      }
      return 'custom';
    };
    const _resolveOpenPlanDialog = () => {
      if (plan && !createNew) {
        return {
      track: plan.track || 'memorization',
      startDate: plan.startDate || minimumPlanStartDate,
      startSurah: String(plan.startSurah),
      startAyah: String(plan.startAyah),
      startPage: String(plan.startPage || ''),
      endSurah: String(plan.endSurah),
      endAyah: String(plan.endAyah),
      endPage: String(plan.endPage || ''),
      dailyPreset: ['0.25', '0.5', '1', '1.5', '2'].includes(String(plan.dailyPages)) ? String(plan.dailyPages) : 'custom',
      dailyPages: plan.dailyPages,
      linkPreset: ['10', '20'].includes(String(plan.linkPages)) ? String(plan.linkPages) : 'custom',
      linkPages: plan.linkPages,
      reviewPreset: _resolveReviewPreset(),
      reviewPages: plan.reviewPages,
      reviewSplitWeekly: Boolean(plan.reviewSplitWeekly),
      reviewWeekStartDay: String(plan.reviewWeekStartDay ?? 0),
      reviewWeekEndDay: String(plan.reviewWeekEndDay ?? 6),
      reviewMinDailyPages: plan.reviewMinDailyPages || 1,
      priorMemorization: Array.isArray(plan.priorMemorization) ? plan.priorMemorization : [],
    };
      }
      return { ...emptyForm, startDate: minimumPlanStartDate };
    };
    setForm(_resolveOpenPlanDialog());
  };

  useEffect(() => {
    if (quranReferenceMode !== 'page') return;
    setForm((current) => {
      const startBlocked = current.startPage
        && !currentPlanBoundaryPages.has(String(current.startPage))
        && pageInRanges(current.startPage, unavailablePageRanges);
      const endBlocked = current.endPage
        && !currentPlanBoundaryPages.has(String(current.endPage))
        && pageInRanges(current.endPage, unavailablePageRanges);
      if (!startBlocked && !endBlocked) return current;
      return {
        ...current,
        startPage: startBlocked ? '' : current.startPage,
        endPage: endBlocked ? '' : current.endPage,
      };
    });
  }, [currentPlanBoundaryPages, quranReferenceMode, unavailablePageRanges]);

  const savePlan = async ({ confirmed = false } = {}) => {
    if (!selectedRow) return;
    const isPageMode = quranReferenceMode === 'page';
    const planRangeMissing = isPageMode
      ? (!form.startPage || !form.endPage)
      : (!form.startSurah || !form.startAyah || !form.endSurah || !form.endAyah);
    if (planRangeMissing || preview?.error) {
      toast({ title: 'الخطة غير مكتملة', description: preview?.error || 'اختر بداية ونهاية الخطة.', variant: 'destructive' });
      return;
    }
    if ((!selectedRow.plan || isCreatingNewPlan) && (form.startDate || minimumPlanStartDate) < minimumPlanStartDate) {
      toast({ title: 'بداية الخطة غير صحيحة', description: `اختر تاريخ ${minimumPlanStartDate} أو تاريخًا بعده.`, variant: 'destructive' });
      return;
    }
    if (selectedRow.plan && !isCreatingNewPlan && !confirmed) {
      setConfirmPlanSaveOpen(true);
      return;
    }
    setConfirmPlanSaveOpen(false);
    setIsSaving(true);
    try {
      await studentsApi.saveStudentPlan(selectedRow.studentId, {
        track: form.track || 'memorization',
        startDate: form.startDate || minimumPlanStartDate,
        ...(isPageMode ? {
          startPage: Number(form.startPage),
          endPage: Number(form.endPage),
        } : {
          startSurah: Number(form.startSurah),
          startAyah: Number(form.startAyah),
          endSurah: Number(form.endSurah),
          endAyah: Number(form.endAyah),
        }),
        dailyPages: getPagesValue(form.dailyPreset, form.dailyPages, 0.25),
        linkPages: getPagesValue(form.linkPreset, form.linkPages),
        reviewPages: getPagesValue(form.reviewPreset, form.reviewPages),
        reviewSplitWeekly: Boolean(form.reviewSplitWeekly),
        reviewWeekStartDay: Number(form.reviewWeekStartDay),
        reviewWeekEndDay: Number(form.reviewWeekEndDay),
        reviewMinDailyPages: Number(form.reviewMinDailyPages || 1),
        priorMemorization: (form.priorMemorization || []).map((item) => ({
          startPage: Number(item.startPage),
          endPage: Number(item.endPage),
          startSurah: Number(item.startSurah || 0),
          startAyah: Number(item.startAyah || 0),
          endSurah: Number(item.endSurah || 0),
          endAyah: Number(item.endAyah || 0),
        })),
      });
      toast({ title: 'تم الحفظ', description: 'تم حفظ خطة الطالب.' });
      setSelectedRow(null);
      await loadRows();
    } catch (error) {
      toast({ title: 'تعذر الحفظ', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!priorForm.startSurah) {
      setPriorStartAyahs([]);
      return;
    }
    loadOfflineSnapshot(getAccountId(), `quran:ayahs:${priorForm.startSurah}`, () => studentsApi.getQuranAyahs(priorForm.startSurah))
      .then(setPriorStartAyahs).catch(() => setPriorStartAyahs([]));
  }, [priorForm.startSurah]);

  useEffect(() => {
    if (!priorForm.endSurah) {
      setPriorEndAyahs([]);
      return;
    }
    loadOfflineSnapshot(getAccountId(), `quran:ayahs:${priorForm.endSurah}`, () => studentsApi.getQuranAyahs(priorForm.endSurah))
      .then(setPriorEndAyahs).catch(() => setPriorEndAyahs([]));
  }, [priorForm.endSurah]);

  const chapterName = useCallback((surah) => chapters.find((chapter) => String(chapter.number) === String(surah))?.name || `سورة ${surah}`, [chapters]);
  const quranRangeLabel = (item) => (
    quranReferenceMode === 'page' || !item.startSurah || !item.endSurah
      ? `صفحة ${numberText(item.startPage)} إلى ${numberText(item.endPage)}`
      : `${chapterName(item.startSurah)} ${item.startAyah} إلى ${chapterName(item.endSurah)} ${item.endAyah}`
  );

  const memorizedSegments = useMemo(() => {
    const ranges = memorizedRow?.plan?.priorMemorization || [];
    if (!ranges.length || !juzRanges.length) return [];
    return juzRanges.map((juz) => {
      const pages = new Set();
      let endRef = {
        surahName: juz.endSurahName,
        ayah: juz.endAyah,
        page: 0,
      };
      for (const range of ranges) {
        const from = Math.max(Number(range.startPage), Number(juz.startPage));
        const to = Math.min(Number(range.endPage), Number(juz.endPage));
        if (from > to) continue;
        for (let page = from; page <= to; page += 1) pages.add(page);
        if (to <= Number(juz.endPage) && to >= Number(endRef.page || 0)) {
          endRef = {
            surahName: Number(range.endPage) <= Number(juz.endPage) ? chapterName(range.endSurah) : juz.endSurahName,
            ayah: Number(range.endPage) <= Number(juz.endPage) ? range.endAyah : juz.endAyah,
            page: to,
          };
        }
      }
      if (!pages.size) return null;
      const isComplete = pages.size >= Number(juz.endPage) - Number(juz.startPage) + 1;
      const segmentFromPage = Math.min(...pages);
      const segmentToPage = Math.max(...pages);
      const _resolveLabel = () => {
        if (isComplete) {
          return `الجزء ${numberText(juz.juz)} كامل`;
        }
        if (quranReferenceMode === 'page') {
          return `الجزء ${numberText(juz.juz)}: صفحة ${numberText(segmentFromPage)} إلى ${numberText(segmentToPage)}`;
        }
        return `الجزء ${numberText(juz.juz)}: من ${juz.startSurahName} ${numberText(juz.startAyah)} إلى ${endRef.surahName} ${numberText(endRef.ayah)}`;
      };
      return {
        juz: juz.juz,
        fromPage: segmentFromPage,
        toPage: segmentToPage,
        label: _resolveLabel(),
      };
    }).filter(Boolean);
  }, [chapterName, juzRanges, memorizedRow, quranReferenceMode]);

  const openMemorizedDialog = (row) => {
    setMemorizedRow(row);
  };

  const deleteMemorizedSegment = async (segment) => {
    if (!memorizedRow?.studentId || !segment) return;
    setIsDeletingMemorized(true);
    try {
      await studentsApi.deleteStudentPriorMemorization(memorizedRow.studentId, {
        fromPage: segment.fromPage,
        toPage: segment.toPage,
      });
      toast({ title: 'تم الحذف', description: 'تم حذف المحفوظ السابق من الطالب.' });
      setMemorizedRow(null);
      await loadRows();
    } catch (error) {
      toast({ title: 'تعذر حذف المحفوظ', description: error.message, variant: 'destructive' });
    } finally {
      setIsDeletingMemorized(false);
    }
  };

  const deletePlan = async () => {
    if (!deletePlanRow?.studentId) return;
    setIsDeletingPlan(true);
    try {
      await studentsApi.deleteStudentPlan(deletePlanRow.studentId);
      toast({ title: 'تم الحذف', description: 'تم حذف خطة الطالب الحالية.' });
      setDeletePlanRow(null);
      await loadRows();
    } catch (error) {
      toast({ title: 'تعذر حذف الخطة', description: error.message, variant: 'destructive' });
    } finally {
      setIsDeletingPlan(false);
    }
  };

  const setSurahWithDefaultAyah = async ({ value, mode, setAyahs, setState, surahKey, ayahKey }) => {
    setState((current) => ({ ...current, [surahKey]: value, [ayahKey]: '' }));
    try {
      const ayahs = await loadOfflineSnapshot(
        getAccountId(),
        `quran:ayahs:${value}`,
        () => studentsApi.getQuranAyahs(value),
      );
      setAyahs(ayahs);
      const availableAyahs = ayahs.filter((ayah) => !quranRefInRanges(value, ayah.ayah, unavailableQuranRanges));
      const nextAyah = mode === 'end' ? availableAyahs[availableAyahs.length - 1] : availableAyahs[0];
      if (nextAyah) {
        setState((current) => (
          String(current[surahKey]) === String(value)
            ? { ...current, [ayahKey]: String(nextAyah.ayah) }
            : current
        ));
      }
    } catch {
      setAyahs([]);
    }
  };

  const addPriorMemorization = () => {
    if (quranReferenceMode === 'page') {
      const startPage = Number(priorForm.startPage || 0);
      const endPage = Number(priorForm.endPage || 0);
      if (!startPage || !endPage || startPage < 1 || endPage > 604 || startPage > endPage) {
        toast({ title: 'المحفوظ السابق غير صحيح', description: 'تأكد من بداية ونهاية المقطع.', variant: 'destructive' });
        return;
      }
      const newRange = { startPage, endPage };
      if (unavailablePageRanges.some((range) => rangesOverlap(newRange, range))) {
        toast({ title: 'المحفوظ السابق موجود', description: 'اختر مقطعاً غير مضاف سابقاً.', variant: 'destructive' });
        return;
      }
      setForm((current) => ({
        ...current,
        priorMemorization: [
          ...(current.priorMemorization || []),
          { startPage, endPage },
        ],
      }));
      setPriorForm({ startSurah: '', startAyah: '', startPage: '', endSurah: '', endAyah: '', endPage: '' });
      return;
    }
    if (!priorForm.startSurah || !priorForm.startAyah || !priorForm.endSurah || !priorForm.endAyah) {
      toast({ title: 'المحفوظ السابق غير مكتمل', description: 'اختر بداية ونهاية المقطع.', variant: 'destructive' });
      return;
    }
    const startAyahInfo = priorStartAyahs.find((ayah) => String(ayah.ayah) === String(priorForm.startAyah));
    const endAyahInfo = priorEndAyahs.find((ayah) => String(ayah.ayah) === String(priorForm.endAyah));
    if (
      !startAyahInfo ||
      !endAyahInfo ||
      startAyahInfo.page > endAyahInfo.page ||
      compareQuranRefs(priorForm.startSurah, priorForm.startAyah, priorForm.endSurah, priorForm.endAyah) > 0
    ) {
      toast({ title: 'المحفوظ السابق غير صحيح', description: 'تأكد من بداية ونهاية المقطع.', variant: 'destructive' });
      return;
    }
    const newRange = {
      startSurah: Number(priorForm.startSurah),
      startAyah: Number(priorForm.startAyah),
      startPage: Math.min(startAyahInfo.page, endAyahInfo.page),
      endSurah: Number(priorForm.endSurah),
      endAyah: Number(priorForm.endAyah),
      endPage: Math.max(startAyahInfo.page, endAyahInfo.page),
    };
    if (unavailableQuranRanges.some((range) => quranRangesOverlap(newRange, range))) {
      toast({ title: 'المحفوظ السابق موجود', description: 'اختر مقطعاً غير مضاف سابقاً.', variant: 'destructive' });
      return;
    }
    setForm((current) => ({
      ...current,
      priorMemorization: [
        ...(current.priorMemorization || []),
        {
          ...newRange,
        },
      ],
    }));
    setPriorForm({ startSurah: '', startAyah: '', startPage: '', endSurah: '', endAyah: '', endPage: '' });
  };

  const removePriorMemorization = (index) => {
    setForm((current) => ({
      ...current,
      priorMemorization: (current.priorMemorization || []).filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const _resolveStudentPlansSection = () => {
    if (isLoading) {
      return <DashboardLoader />;
    }
    if (rows.length === 0) {
      return <div className="rounded-xl border border-dashed border-primary/20 py-12 text-center text-muted-foreground">لا يوجد طلاب حالياً.</div>;
    }
    return <div className="space-y-2">
              {rows.map((row) => { const _resolve_resolveStudentPlansSection = () => {
                                     if (row.nazemManaged) {
                                       return <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/5 text-primary" title="الخطة مقفلة" aria-label="الخطة مقفلة">
                        <LockKeyhole className="h-4 w-4" aria-hidden="true" />
                      </span>;
                                     }
                                     if (row.plan) {
                                       return <>
                      {Number(row.plan.progressPercent || 0) >= 100 && (
                        <ManagementIconButton
                          onClick={() => openPlanDialog(row, { createNew: true })}
                          tone="primary"
                          title="خطة جديدة"
                          aria-label={`إضافة خطة جديدة لـ ${row.studentName}`}
                        >
                          <Plus className="h-4 w-4" />
                        </ManagementIconButton>
                      )}
                      <ManagementIconButton
                        onClick={() => openPlanDialog(row)}
                        tone="primary"
                        title="تعديل الخطة"
                        aria-label={`تعديل خطة ${row.studentName}`}
                      >
                        <Edit3 className="h-4 w-4" />
                      </ManagementIconButton>
                    </>;
                                     }
                                     return <Button onClick={() => openPlanDialog(row)} className="gap-2" title="إضافة خطة">
                      <Plus className="h-4 w-4" />إضافة خطة
                    </Button>;
                                   };
                                   return (<div key={row.studentId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-lg border border-primary/20 bg-card/70 p-3 shadow-sm shadow-primary/5 lg:grid-cols-[minmax(300px,auto)_minmax(180px,1fr)_auto]">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 lg:col-start-1">
                    <div className="text-base font-black leading-tight text-foreground">{row.studentName}</div>
                    <div className="text-[10px] font-bold leading-tight text-muted-foreground sm:text-xs">{row.committeeName || 'بدون حلقة'}</div>
                    {row.nazemManaged && <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary" title="الخطة مقفلة" aria-label="الخطة مقفلة"><LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" /></span>}
                  </div>
                  {row.plan && (
                    <div className="col-span-2 min-w-0 lg:col-span-1 lg:col-start-2 lg:row-start-1">
                      <div className="h-2.5 w-full overflow-hidden rounded-full border border-primary/10 bg-muted/60 shadow-inner shadow-primary/10" title={`${numberText(row.plan.progressPercent)}٪`}>
                        <div className="h-full rounded-full bg-primary shadow-sm shadow-primary/30" style={{ width: `${Math.max(0, Math.min(100, Number(row.plan.progressPercent || 0)))}%` }} />
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-black text-muted-foreground sm:text-xs">
                        <span>نسبة الإنجاز {numberText(row.plan.progressPercent)}٪</span>
                      </div>
                    </div>
                  )}
                  <div className="col-start-2 row-start-1 flex items-center gap-2 lg:col-start-3 lg:justify-self-end">
                    {_resolve_resolveStudentPlansSection()}
                    {row.plan && !row.nazemManaged && (
                      <ManagementIconButton
                        onClick={() => openMemorizedDialog(row)}
                        tone="destructive"
                        title="إدارة الحذف"
                        aria-label={`إدارة حذف خطة ومحفوظات ${row.studentName}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </ManagementIconButton>
                    )}
                  </div>
                </div>); })}
            </div>;
  };
  return (
    <div className="space-y-5">
      <Card className="border-primary/30 bg-card/95 shadow-sm shadow-primary/10">
        {!hideCommitteeFilter && (
          <CardHeader className="border-b border-primary/15 p-4">
            <Select value={committeeId} onValueChange={setCommitteeId}>
              <SelectTrigger aria-label="الحلقة" className="max-w-sm bg-background border-primary/30">
                <SelectValue placeholder="اختر الحلقة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الحلقات</SelectItem>
                {committees.map((committee) => (
                  <SelectItem key={committee.id} value={String(committee.id)}>{committee.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
        )}
        <CardContent className="p-4">
          {_resolveStudentPlansSection()}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedRow)} onOpenChange={(open) => {
        if (!open) {
          setSelectedRow(null);
          setConfirmPlanSaveOpen(false);
        }
      }}>
        <DialogContent
          className="max-w-2xl bg-card border-primary/30 p-4 text-foreground sm:p-5"
          dir="rtl"
          onInteractOutside={keepPlanDialogOpen}
        >
          <DialogHeader className="flex-row items-center justify-between space-y-0">
            <DialogTitle className="text-primary neon-text">{selectedRow?.plan && !isCreatingNewPlan ? 'تعديل الخطة' : 'إضافة خطة'}</DialogTitle>
            <Button type="button" variant="outline" onClick={() => setPriorDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              المحفوظ السابق
            </Button>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 sm:gap-4">
              <div className="space-y-2">
                <Label>بداية الخطة</Label>
                {selectedRow?.plan && !isCreatingNewPlan ? (
                  <div className="flex h-11 items-center rounded-xl border border-border bg-muted/40 px-3 text-sm font-bold text-foreground">
                    {form.startDate}
                  </div>
                ) : (
                  <DashboardDatePicker value={form.startDate || minimumPlanStartDate} min={minimumPlanStartDate} ariaLabel="بداية الخطة" onChange={(startDate) => setForm((current) => ({ ...current, startDate }))} />
                )}
              </div>
              <div className="space-y-2">
                <Label>المسار</Label>
                <Select value={form.track || 'memorization'} onValueChange={(value) => setForm((current) => ({ ...current, track: value }))}>
                  <SelectTrigger aria-label="المسار" className="h-11 border-primary/30 bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {quranPlanTracks.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 sm:gap-4">
              <div className="min-w-0 space-y-2">
                <Label>موضع بداية الحفظ</Label>
                {quranReferenceMode === 'page' ? (
                  <PageSelect
                    value={form.startPage}
                    onChange={(value) => setForm((current) => ({ ...current, startPage: value }))}
                    placeholder="صفحة البداية"
                    pages={availablePlanPages}
                  />
                ) : (
                  <QuranRefFields
                    surahValue={form.startSurah}
                    ayahValue={form.startAyah}
                    chapters={availableChapters}
                    allChapters={chapters}
                    ayahOptions={startAyahOptions}
                    onSurahChange={(value) => setSurahWithDefaultAyah({
                      value,
                      mode: 'start',
                      setAyahs: setStartAyahs,
                      setState: setForm,
                      surahKey: 'startSurah',
                      ayahKey: 'startAyah',
                    })}
                    onAyahChange={(value) => setForm((current) => ({ ...current, startAyah: value }))}
                  />
                )}
              </div>
              <div className="min-w-0 space-y-2">
                <Label>نهاية الخطة</Label>
                {quranReferenceMode === 'page' ? (
                  <PageSelect
                    value={form.endPage}
                    onChange={(value) => setForm((current) => ({ ...current, endPage: value }))}
                    placeholder="صفحة النهاية"
                    pages={availablePlanPages}
                  />
                ) : (
                  <QuranRefFields
                    surahValue={form.endSurah}
                    ayahValue={form.endAyah}
                    chapters={availableChapters}
                    allChapters={chapters}
                    ayahOptions={endAyahOptions}
                    onSurahChange={(value) => setSurahWithDefaultAyah({
                      value,
                      mode: 'end',
                      setAyahs: setEndAyahs,
                      setState: setForm,
                      surahKey: 'endSurah',
                      ayahKey: 'endAyah',
                    })}
                    onAyahChange={(value) => setForm((current) => ({ ...current, endAyah: value }))}
                  />
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-2 sm:grid-cols-3 sm:gap-4">
              <PlanAmount label="المقدار اليومي" form={form} setForm={setForm} presetKey="dailyPreset" valueKey="dailyPages" options={[['0.25', 'ربع وجه'], ['0.5', 'نصف وجه'], ['1', 'وجه'], ['1.5', 'وجه ونصف'], ['2', 'وجهين'], ['custom', 'مخصص']]} />
              <PlanAmount label="الربط" form={form} setForm={setForm} presetKey="linkPreset" valueKey="linkPages" options={[['10', '10 أوجه'], ['20', 'جزء'], ['custom', 'مخصص']]} />
              <PlanAmount
                label="المراجعة"
                form={form}
                setForm={setForm}
                presetKey="reviewPreset"
                valueKey="reviewPages"
                options={[['20', 'جزء'], ['40', 'جزئين'], ['60', 'ثلاثة أجزاء'], ['weekly', 'تقسيم المراجعة على أسبوع'], ['custom', 'مخصص']]}
                onPresetChange={(value) => setForm((current) => ({ ...current, reviewPreset: value, reviewSplitWeekly: value === 'weekly' }))}
              />
            </div>

            {form.reviewPreset === 'weekly' && (
              <div className="space-y-3 rounded-xl border border-primary/15 bg-background/60 p-3">
                <div className="grid gap-3">
                  <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label>من يوم</Label>
                    <Select value={form.reviewWeekStartDay} onValueChange={(value) => setForm((current) => ({ ...current, reviewWeekStartDay: value }))}>
                      <SelectTrigger aria-label="من يوم"><SelectValue /></SelectTrigger>
                      <SelectContent>{weekDays.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>إلى يوم</Label>
                    <Select value={form.reviewWeekEndDay} onValueChange={(value) => setForm((current) => ({ ...current, reviewWeekEndDay: value }))}>
                      <SelectTrigger aria-label="إلى يوم"><SelectValue /></SelectTrigger>
                      <SelectContent>{weekDays.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  </div>
                  <div className="space-y-2">
                    <Label>الحد الأدنى اليومي للمراجعة</Label>
                    <Input
                      aria-label="الحد الأدنى اليومي للمراجعة"
                      type="number"
                      min="1"
                      value={form.reviewMinDailyPages}
                      onChange={(event) => setForm((current) => ({ ...current, reviewMinDailyPages: Number(event.target.value || 1) }))}
                      placeholder="عدد الأوجه"
                    />
                  </div>
                </div>
              </div>
            )}

            {(form.priorMemorization || []).length > 0 && (
              <div className="space-y-3 rounded-xl border border-primary/15 bg-background/60 p-3">
                <div className="grid gap-2">
                  {form.priorMemorization.map((item, index) => (
                    <div key={`${item.startSurah}-${item.startAyah}-${item.endSurah}-${item.endAyah}-${index}`} className="grid gap-2 rounded-xl border border-primary/15 bg-card p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                      <div className="min-w-0 text-sm font-bold text-foreground">
                        {quranRangeLabel(item)}
                      </div>
                      <ManagementIconButton onClick={() => removePriorMemorization(index)} tone="destructive" aria-label="حذف المحفوظ السابق">
                        <Trash2 className="h-4 w-4" />
                      </ManagementIconButton>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {preview && (
              <div className={`rounded-xl border p-4 text-sm font-bold ${preview.error ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-primary/20 bg-primary/5 text-foreground'}`}>
                {preview.error || `الأيام المتوقعة لإنهاء الخطة: ${numberText(preview.days)}`}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedRow(null)}>إغلاق</Button>
            <Button onClick={() => savePlan()} disabled={isSaving}>{isSaving ? 'جاري الحفظ...' : 'حفظ'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmPlanSaveOpen} onOpenChange={setConfirmPlanSaveOpen}>
        <DialogContent className="max-w-md bg-card border-primary/30 p-4 text-foreground sm:p-5" dir="rtl" onInteractOutside={keepPlanDialogOpen}>
          <DialogHeader>
            <DialogTitle className="text-primary neon-text">تأكيد تعديل الخطة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm font-bold text-foreground">
            <p>المحفوظ السابق والحفظ المعتمد من المعلم لن يتم حذفهما.</p>
            <p>سيتم حساب الخطة الجديدة بهذه الطريقة: نطاق الخطة الجديدة ناقص المحفوظ الفعلي.</p>
            <div className="rounded-xl border border-primary/15 bg-background/70 p-3 text-muted-foreground">
              {preview?.pages === 0
                ? 'كل نطاق الخطة الجديدة محفوظ حاليًا.'
                : `المتبقي للحفظ داخل النطاق الجديد: ${numberText(preview?.pages || 0)} وجه.`}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmPlanSaveOpen(false)}>إلغاء</Button>
            <Button onClick={() => savePlan({ confirmed: true })} disabled={isSaving}>
              {isSaving ? 'جاري الحفظ...' : 'تأكيد الحفظ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={priorDialogOpen} onOpenChange={setPriorDialogOpen}>
        <DialogContent className="max-w-lg bg-card border-primary/30 p-4 text-foreground sm:p-5" dir="rtl" onInteractOutside={keepPlanDialogOpen}>
          <DialogHeader>
            <DialogTitle className="text-primary neon-text">المحفوظ السابق</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="min-w-0 space-y-2">
                <Label>من</Label>
                {quranReferenceMode === 'page' ? (
                  <PageSelect
                    value={priorForm.startPage}
                    onChange={(value) => setPriorForm({ ...priorForm, startPage: value })}
                    placeholder="صفحة البداية"
                    pages={availablePlanPages}
                  />
                ) : (
                  <QuranRefFields
                    surahValue={priorForm.startSurah}
                    ayahValue={priorForm.startAyah}
                    chapters={availableChapters}
                    allChapters={chapters}
                    ayahOptions={priorStartAyahOptions}
                    onSurahChange={(value) => setSurahWithDefaultAyah({
                      value,
                      mode: 'start',
                      setAyahs: setPriorStartAyahs,
                      setState: setPriorForm,
                      surahKey: 'startSurah',
                      ayahKey: 'startAyah',
                    })}
                    onAyahChange={(value) => setPriorForm({ ...priorForm, startAyah: value })}
                  />
                )}
              </div>
              <div className="min-w-0 space-y-2">
                <Label>إلى</Label>
                {quranReferenceMode === 'page' ? (
                  <PageSelect
                    value={priorForm.endPage}
                    onChange={(value) => setPriorForm({ ...priorForm, endPage: value })}
                    placeholder="صفحة النهاية"
                    pages={availablePlanPages.filter((page) => !priorForm.startPage || Number(page) >= Number(priorForm.startPage))}
                  />
                ) : (
                  <QuranRefFields
                    surahValue={priorForm.endSurah}
                    ayahValue={priorForm.endAyah}
                    chapters={availableChapters}
                    allChapters={chapters}
                    ayahOptions={priorEndAyahOptions}
                    onSurahChange={(value) => setSurahWithDefaultAyah({
                      value,
                      mode: 'end',
                      setAyahs: setPriorEndAyahs,
                      setState: setPriorForm,
                      surahKey: 'endSurah',
                      ayahKey: 'endAyah',
                    })}
                    onAyahChange={(value) => setPriorForm({ ...priorForm, endAyah: value })}
                  />
                )}
              </div>
            </div>
            <Button type="button" onClick={addPriorMemorization} className="gap-2">
              <Plus className="h-4 w-4" />
              إضافة
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPriorDialogOpen(false)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(memorizedRow)} onOpenChange={(open) => !open && setMemorizedRow(null)}>
        <DialogContent className="max-w-lg bg-card border-primary/30 p-4 text-foreground sm:p-5" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-primary neon-text">إدارة الحذف - {memorizedRow?.studentName}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {memorizedSegments.length === 0 ? (
              <div className="rounded-xl border border-dashed border-primary/20 p-6 text-center text-muted-foreground">
                لا يوجد محفوظ سابق لهذا الطالب.
              </div>
            ) : memorizedSegments.map((segment) => (
              <div key={`${segment.juz}-${segment.fromPage}-${segment.toPage}`} className="grid gap-3 rounded-xl border border-primary/15 bg-background/70 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0 text-sm font-black text-foreground">{segment.label}</div>
                <ManagementIconButton
                  onClick={() => deleteMemorizedSegment(segment)}
                  disabled={isDeletingMemorized}
                  tone="destructive"
                  title="حذف هذا المحفوظ"
                >
                  <Trash2 className="h-4 w-4" />
                </ManagementIconButton>
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setMemorizedRow(null)}>إغلاق</Button>
            <Button
              variant="destructive"
              onClick={() => {
                setDeletePlanRow(memorizedRow);
                setMemorizedRow(null);
              }}
            >
              حذف الخطة الحالية
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deletePlanRow)} onOpenChange={(open) => !open && setDeletePlanRow(null)}>
        <DialogContent className="max-w-md bg-card border-primary/30 p-4 text-foreground sm:p-5" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-primary neon-text">حذف الخطة</DialogTitle>
          </DialogHeader>
          <p className="text-sm font-bold leading-6 text-muted-foreground">
            هل تريد حذف الخطة الحالية للطالب {deletePlanRow?.studentName}؟
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePlanRow(null)} disabled={isDeletingPlan}>إلغاء</Button>
            <Button variant="destructive" onClick={deletePlan} disabled={isDeletingPlan}>
              {isDeletingPlan ? 'جاري الحذف...' : 'حذف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const PlanAmount = ({ label, form, setForm, presetKey, valueKey, options, onPresetChange }) => (
  <div className="space-y-2">
    <Label>{label}</Label>
    {form[presetKey] === 'custom' ? (
      <div className="flex h-12 items-center rounded-md border border-input bg-background px-2 focus-within:ring-2 focus-within:ring-ring">
        <Input
          aria-label={label}
          type="number"
          inputMode={presetKey === 'dailyPreset' ? 'decimal' : 'numeric'}
          min={presetKey === 'dailyPreset' ? '0.25' : '1'}
          step={presetKey === 'dailyPreset' ? '0.25' : '1'}
          className="h-11 border-0 bg-transparent px-2 text-right shadow-none focus-visible:ring-0"
          value={form[valueKey]}
          onChange={(event) => setForm((current) => ({ ...current, [valueKey]: Number(event.target.value || 1) }))}
          placeholder="عدد الأوجه"
        />
        <Button
          type="button"
          variant="ghost"
          className="h-8 shrink-0 px-2 text-xs"
          onClick={() => setForm((current) => ({
            ...current,
            [presetKey]: options[0][0],
            [valueKey]: Number(options[0][0]) || current[valueKey],
            ...(presetKey === 'reviewPreset' ? { reviewSplitWeekly: false } : {}),
          }))}
        >
          اختيار
        </Button>
      </div>
    ) : (
      <Select value={form[presetKey]} onValueChange={(value) => (onPresetChange ? onPresetChange(value) : setForm((current) => ({ ...current, [presetKey]: value })))}>
        <SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map(([value, text]) => <SelectItem key={value} value={value}>{text}</SelectItem>)}
        </SelectContent>
      </Select>
    )}
  </div>
);

const quranPages = Array.from({ length: 604 }, (_, index) => String(index + 1));

const PageSelect = ({ value, onChange, placeholder, pages = quranPages }) => (
  <Select value={String(value || '')} onValueChange={onChange}>
    <SelectTrigger aria-label={placeholder} className="h-12 bg-background text-center font-bold [&>span]:w-full [&>span]:text-center">
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent className="max-h-72">
      {pages.map((page) => (
        <SelectItem key={page} value={page}>{page}</SelectItem>
      ))}
    </SelectContent>
  </Select>
);

const QuranRefFields = ({
  surahValue,
  ayahValue,
  chapters,
  allChapters,
  ayahOptions,
  onSurahChange,
  onAyahChange,
}) => (
  <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_108px]">
    <SurahSearchSelect
      value={surahValue}
      chapters={chapters}
      allChapters={allChapters}
      placeholder="السورة"
      onChange={onSurahChange}
    />
    <AyahSearchSelect value={ayahValue} ayahs={ayahOptions} onChange={onAyahChange} />
  </div>
);

export default StudentPlansSection;
