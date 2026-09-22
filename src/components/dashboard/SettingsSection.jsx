import EvaluationUnitSelector from './EvaluationUnitSelector';
import StaffAttendanceSettings from './StaffAttendanceSettings';
import EndTermDialog from './EndTermDialog';
import SettingsGroup from './SettingsGroup';
import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import AccountDeletionRequestsDialog from '@/components/dashboard/AccountDeletionRequestsDialog';
import AccountPolicyLinks from '@/components/dashboard/AccountPolicyLinks';
import DailyChallengePreviewDialog from '@/components/dashboard/DailyChallengePreviewDialog';
import CountPointsSettingField from '@/components/dashboard/CountPointsSettingField';
import EvaluationScalingHelp from '@/components/dashboard/EvaluationScalingHelp';
import NazemIntegrationSettings from '@/components/dashboard/NazemIntegrationSettings';
import SummitMapEditor from '@/components/dashboard/SummitMapEditor';
import SettingsCategoryPanel from '@/components/dashboard/SettingsCategoryPanel';
import MessageTemplateField, { TemplateVariablesHint } from '@/components/dashboard/MessageTemplateField';
import { studentsApi } from '@/services/studentsApi';
import SettingToggle, { ToggleSwitch } from '@/components/ui/setting-toggle';
import MultiSelectSetting from '@/components/ui/multi-select-setting';
import InlineToggleNumberSetting from '@/components/ui/inline-toggle-number-setting';
import TeacherPointTypesSetting from '@/components/dashboard/TeacherPointTypesSetting';
import ResetPointsDialog from '@/components/dashboard/ResetPointsDialog';
import { updateEvaluationMaxScore } from '../../../shared/evaluation-settings.js';
import { DAILY_CHALLENGE_GAMES, DAILY_CHALLENGE_WEEK_DAYS } from '../../../shared/daily-challenge.js';
import { enforcePointsFeatureDependencies } from '../../../shared/points-feature-settings.js';
import { normalizeSummitMapConfig } from '../../../shared/summit-map.js';
import useRewardUnits from '@/hooks/useRewardUnits';
import { writePublicSettingsCache } from '@/services/publicSettingsCache';

const defaultSettings = {
  attendancePoints: 1,
  manualLateAttendancePoints: 0,
  excusedAttendancePoints: 0,
  attendanceManualEnabled: true,
  weeklyHolidayDays: [5, 6],
  holidayTaskTypes: [],
  recitationSessionDays: [0, 1, 2, 3, 4],
  quranTaskExecutionSource: 'student',
  memorizationExecutionSource: 'teacher',
  reviewExecutionSource: 'both',
  linkExecutionSource: 'both',
  nazemIntegrationEnabled: false,
  recitationAmountDay: 'previous_day',
  hideStudentAmounts: false,
  hideStudentMemorizationAmount: true,
  hideStudentReviewAmount: true,
  hideStudentLinkAmount: true,

  studentTaskAmountEditable: true,
  studentReviewAmountEditable: true,
  studentLinkAmountEditable: true,
  allowQuranCompensation: true,
  quranCompensationPointsPercent: 100,
  allowQuranExtra: false,
  quranExtraPointsPercent: 50,
  recitationAttendanceSource: 'supervisor',
  staffAttendanceSource: 'supervisor',
  staffAttendanceLocationUrl: '',
  staffAttendanceLateAfterAsrMinutes: 50,
  automaticAbsenceMessageEnabled: false,
  automaticExecutionMessageEnabled: false,
  executionReminderExcludedStudentIds: [],
  attendanceAbsentTemplate: 'السلام عليكم، تم تسجيل غياب الطالب {name} بتاريخ {date}.',
  quranReferenceMode: 'ayah',
  pointsSystemEnabled: false,
  teacherManualPointsEnabled: false,
  teacherManualPointsTermLimit: 100,
  teacherPointTypes: [],
  studentRankingsVisible: true,
  familyRankingsVisible: true,
  familyRankingMode: 'total',
  rankingPointsVisible: true,
  storeEnabled: false,
  storePurchaseDeductsRanking: false,
  learningPathsEnabled: false,
  dailyChallengeEnabled: false,
  dailyChallengePoints: 20,
  dailyChallengeGames: DAILY_CHALLENGE_GAMES.map(({ value }) => value),
  dailyChallengeDays: DAILY_CHALLENGE_WEEK_DAYS.map(({ value }) => value),
  summitEnabled: true,
  summitChallengeMaxPoints: 50,
  summitMapConfig: normalizeSummitMapConfig(),
  registrationEnabled: false,
  registrationPreAcceptTemplate: 'السلام عليكم، تم قبول طلب تسجيل الطالب {name} مبدئياً، وسيتم التواصل معكم لإكمال الإجراء.',
  registrationAcceptTemplate: 'السلام عليكم، تم قبول الطالب {name} في حلقة {committee}. رقم الدخول: {login}.',
  registrationRejectTemplate: 'السلام عليكم، نعتذر عن قبول طلب تسجيل الطالب {name} حالياً.',
  executionReminderTemplate: 'السلام عليكم، لم يتم تنفيذ خطة الطالب {name} بتاريخ {date}.',
  quranTestMessageTemplate: 'السلام عليكم، لديك موعد اختبار في {juz} بتاريخ {date}.',
  quranTestMaxScore: 100,
  quranTestWarningDeduction: 1,
  quranTestMistakeDeduction: 5,
  quranTestRetestScore: 60,
  quranTestPassingScore: 85,
  narrationMaxScore: 100,
  narrationWarningDeduction: 1,
  narrationMistakeDeduction: 5,
  narrationStartTemplate: 'السلام عليكم، بدأ {eventName} من {fromDate} إلى {toDate}.',
  narrationEndTemplate: 'السلام عليكم، انتهى {eventName}.',
  narrationResultTemplate: 'نتيجة {name} في {eventName}: {score} من 100، التقدير {rating}.',
  teacherEvaluationMaxScore: 100,
  teacherEvaluationWarningDeduction: 1,
  teacherEvaluationMistakeDeduction: 5,
  teacherEvaluationPassingScore: 85,
  memorizationEvaluationMaxScore: 100,
  memorizationEvaluationWarningDeduction: 2,
  memorizationEvaluationMistakeDeduction: 3,
  memorizationEvaluationPassingScore: 95,
  memorizationQuarterFaceEvaluationMaxScore: 100,
  memorizationQuarterFaceEvaluationWarningDeduction: 2,
  memorizationQuarterFaceEvaluationMistakeDeduction: 3,
  memorizationQuarterFaceEvaluationPassingScore: 95,
  memorizationHalfFaceEvaluationMaxScore: 100,
  memorizationHalfFaceEvaluationWarningDeduction: 2,
  memorizationHalfFaceEvaluationMistakeDeduction: 3,
  memorizationHalfFaceEvaluationPassingScore: 95,
  masteryEvaluationMaxScore: 100,
  masteryEvaluationWarningDeduction: 2,
  masteryEvaluationMistakeDeduction: 3,
  masteryEvaluationPassingScore: 95,
  masteryQuarterFaceEvaluationMaxScore: 100,
  masteryQuarterFaceEvaluationWarningDeduction: 2,
  masteryQuarterFaceEvaluationMistakeDeduction: 3,
  masteryQuarterFaceEvaluationPassingScore: 95,
  masteryHalfFaceEvaluationMaxScore: 100,
  masteryHalfFaceEvaluationWarningDeduction: 2,
  masteryHalfFaceEvaluationMistakeDeduction: 3,
  masteryHalfFaceEvaluationPassingScore: 95,
  reviewEvaluationMaxScore: 100,
  reviewEvaluationWarningDeduction: 1,
  reviewEvaluationMistakeDeduction: 2,
  reviewEvaluationPassingScore: 85,
  linkEvaluationMaxScore: 100,
  linkEvaluationWarningDeduction: 1,
  linkEvaluationMistakeDeduction: 2,
  linkEvaluationPassingScore: 85,
  teacherEvaluationOneFaceMistakes: 1,
  teacherEvaluationOneFaceWarnings: 2,
  teacherEvaluationTwoFacesMistakes: 2,
  teacherEvaluationTwoFacesWarnings: 3,
  teacherEvaluationThreePlusFacesMistakes: 3,
  teacherEvaluationThreePlusFacesWarnings: 5,
  masteryEvaluationOneFaceMistakes: 1,
  masteryEvaluationOneFaceWarnings: 2,
  masteryEvaluationTwoFacesMistakes: 2,
  masteryEvaluationTwoFacesWarnings: 3,
  masteryEvaluationThreePlusFacesMistakes: 3,
  masteryEvaluationThreePlusFacesWarnings: 5,
  memorizationRepeatCount: 1,
  masteryRepeatCount: 1,
  memorizationListeningCount: 3,
  masteryListeningCount: 3,
  memorizationRepeatPointValue: 1,
  masteryRepeatPointValue: 1,
  memorizationListeningPointValue: 10,
  masteryListeningPointValue: 10,
  allowRepeatCountEditing: false,
  allowListeningCountEditing: false,
};

const weekDays = [
  { value: 6, label: 'السبت' },
  { value: 0, label: 'الأحد' },
  { value: 1, label: 'الاثنين' },
  { value: 2, label: 'الثلاثاء' },
  { value: 3, label: 'الأربعاء' },
  { value: 4, label: 'الخميس' },
  { value: 5, label: 'الجمعة' },
];

const holidayTaskTypes = [
  { value: 'memorization', label: 'الحفظ والإتقان' },
  { value: 'review', label: 'المراجعة' },
  { value: 'link', label: 'الربط' },
];

const teacherEvaluationTypes = [
  { key: 'memorization', label: 'الحفظ', repeatKey: 'memorizationRepeatCount', repeatPointsKey: 'memorizationRepeatPointValue', listeningKey: 'memorizationListeningCount', listeningPointsKey: 'memorizationListeningPointValue', unitLabel: 'لكل وجه' },
  { key: 'mastery', label: 'الإتقان', repeatKey: 'masteryRepeatCount', repeatPointsKey: 'masteryRepeatPointValue', listeningKey: 'masteryListeningCount', listeningPointsKey: 'masteryListeningPointValue', unitLabel: 'لكل وجه' },
  { key: 'review', label: 'المراجعة', showsScalingHelp: true },
  { key: 'link', label: 'الربط', showsScalingHelp: true },
];

const normalizeList = (value = []) => (Array.isArray(value) ? value : []).map(String);

const mergeStudentTaskEditingControls = (value) => {
  return {
    ...value,
    attendanceManualEnabled: value.recitationAttendanceSource !== 'teacher',
    memorizationExecutionSource: value.memorizationExecutionSource || 'teacher',
    recitationAmountDay: value.nazemIntegrationEnabled ? 'same_day' : value.recitationAmountDay,
  };
};

const SettingsSection = ({
  activeCategory = 'settingsAttendance',
  onSettingsChange,
  canManageDeletionRequests = false,
  canResetPoints = false,
}) => {
  const { toast } = useToast();
  const [settings, setSettings] = useState(defaultSettings);
  const rewardUnits = useRewardUnits(settings.summitEnabled);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [endTermOpen, setEndTermOpen] = useState(false);
  const [endTermConfirmText, setEndTermConfirmText] = useState('');
  const [isEndingTerm, setIsEndingTerm] = useState(false);
  const [dailyChallengePreviewOpen, setDailyChallengePreviewOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [evaluationType, setEvaluationType] = useState('memorization');
  const [evaluationUnit, setEvaluationUnit] = useState('face');
  const [executionReminderStudents, setExecutionReminderStudents] = useState([]);
  const didLoadRef = useRef(false);
  const lastSavedRef = useRef('');
  const latestSettingsRef = useRef(defaultSettings);
  const saveRequestRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    studentsApi.getSettings().then((data) => {
      if (!mounted) return;
      const next = mergeStudentTaskEditingControls(
        enforcePointsFeatureDependencies({ ...defaultSettings, ...data }),
      );
      lastSavedRef.current = JSON.stringify(next);
      didLoadRef.current = true;
      setSettings(next);
      onSettingsChange?.(next);
    }).catch((error) => {
      if (!mounted) return;
      toast({ title: 'تعذر تحميل الإعدادات', description: error.message, variant: 'destructive' });
    }).finally(() => {
      if (mounted) setIsLoading(false);
    });
    studentsApi.getExecutionReminderStudents()
      .then((data) => {
        if (mounted) setExecutionReminderStudents(Array.isArray(data?.students) ? data.students : []);
      })
      .catch(() => {
        if (mounted) setExecutionReminderStudents([]);
      });
    return () => {
      mounted = false;
    };
  }, [onSettingsChange, toast]);

  useEffect(() => {
    latestSettingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!didLoadRef.current) return undefined;
    const signature = JSON.stringify(settings);
    if (signature === lastSavedRef.current) return undefined;

    const requestId = saveRequestRef.current + 1;
    saveRequestRef.current = requestId;
    setIsSaving(true);
    setSaveStatus('saving');

    const timeout = setTimeout(async () => {
      try {
        const saved = mergeStudentTaskEditingControls(
          enforcePointsFeatureDependencies({ ...defaultSettings, ...(await studentsApi.updateSettings(settings)) }),
        );
        if (saveRequestRef.current !== requestId) return;
        if (JSON.stringify(latestSettingsRef.current) !== signature) return;
        latestSettingsRef.current = saved;
        lastSavedRef.current = JSON.stringify(saved);
        setSettings(saved);
        writePublicSettingsCache(saved);
        onSettingsChange?.(saved);
        window.dispatchEvent(new CustomEvent('madarij-settings-updated', { detail: saved }));
        setSaveStatus('saved');
      } catch (error) {
        if (saveRequestRef.current !== requestId) return;
        setSaveStatus('error');
        toast({ title: 'تعذر الحفظ التلقائي', description: error.message, variant: 'destructive' });
      } finally {
        if (saveRequestRef.current === requestId) setIsSaving(false);
      }
    }, 700);

    return () => clearTimeout(timeout);
  }, [onSettingsChange, settings, toast]);

  const toggleListValue = (key, value) => {
    setSettings((current) => {
      const selected = normalizeList(current[key]);
      const valueText = String(value);
      const hasValue = selected.includes(valueText);
      if (['recitationSessionDays', 'dailyChallengeDays'].includes(key) && hasValue && selected.length <= 1) {
        return current;
      }
      const next = hasValue
        ? selected.filter((item) => item !== valueText)
        : [...selected, valueText];
      return { ...current, [key]: next };
    });
  };

  const endTerm = async () => {
    setIsEndingTerm(true);
    try {
      const result = await studentsApi.endTerm(endTermConfirmText);
      toast({
        title: 'تم إنهاء الفصل',
        description: `تم إنشاء ${result.archive?.title || 'أرشيف جديد'}، ويبدأ الفصل الجديد بتاريخ ${result.archive?.nextTermStartDate || 'اليوم التالي'}.`,
      });
      setEndTermOpen(false);
      setEndTermConfirmText('');
    } catch (error) {
      toast({ title: 'تعذر إنهاء الفصل', description: error.message, variant: 'destructive' });
    } finally {
      setIsEndingTerm(false);
    }
  };

  if (isLoading) {
    return <DashboardLoader className="min-h-[420px]" />;
  }

  const selectedEvaluationType = teacherEvaluationTypes.find(({ key }) => key === evaluationType)
    || teacherEvaluationTypes[0];
  const supportsFractionalFaces = ['memorization', 'mastery'].includes(selectedEvaluationType.key);
  const _resolveEvaluationSettingPrefix = () => {
    if (supportsFractionalFaces && evaluationUnit !== 'face') {
      return `${selectedEvaluationType.key}${evaluationUnit === 'quarterFace' ? 'QuarterFace' : 'HalfFace'}Evaluation`;
    }
    return `${selectedEvaluationType.key}Evaluation`;
  };
  const evaluationSettingPrefix = _resolveEvaluationSettingPrefix();
  const _resolveEvaluationUnitLabel = () => {
    if (evaluationUnit === 'quarterFace') {
      return 'لربع وجه';
    }
    if (evaluationUnit === 'halfFace') {
      return 'لنصف وجه';
    }
    return selectedEvaluationType.unitLabel;
  };
  const evaluationUnitLabel = _resolveEvaluationUnitLabel();
  const termClosureSummary = settings.nazemIntegrationEnabled
    ? 'ينشئ أرشيفًا للتقارير، ويحوّل الحفظ المعتمد إلى محفوظ سابق، ويصفّر النقاط وأرصدة المتجر والخريطة وتحدياتها. تبقى خطط ناظم المرتبطة نشطة، وتُحذف المقادير المستقبلية غير المنفذة لتعود من ناظم في الفصل الجديد. زامن جلسات الأجهزة قبل الإنهاء.'
    : 'ينشئ أرشيفًا للتقارير، ويحوّل الحفظ المعتمد إلى محفوظ سابق، ويوقف الخطط الحالية، ويصفّر النقاط وأرصدة المتجر والخريطة وتحدياتها. يبدأ الفصل الجديد في اليوم التالي، ولا تُحذف الحسابات أو المحفوظ.';

  const _resolveSettingsSection = () => {
    if (saveStatus === 'error') {
      return 'تعذر الحفظ التلقائي';
    }
    if (isSaving) {
      return 'جاري الحفظ...';
    }
    return 'محفوظ تلقائياً';
  };
  return (
    <div className="space-y-7">
      <Card className="mx-auto w-full max-w-5xl overflow-visible border-primary/25 bg-card/90 shadow-lg shadow-primary/5">
        <CardContent className="p-0">
          <SettingsCategoryPanel category="settingsAttendance" activeCategory={activeCategory} title="التحضير وجلسات التسميع">
          <SettingToggle
            label="إخفاء المقدار عن الطلاب"
            checked={Boolean(settings.hideStudentAmounts)}
            onCheckedChange={(checked) => setSettings({ ...settings, hideStudentAmounts: checked })}
          />
          {settings.hideStudentAmounts && <SettingsGroup>
            <SettingToggle label="إخفاء الحفظ والإتقان" checked={settings.hideStudentMemorizationAmount !== false} onCheckedChange={(checked) => setSettings({ ...settings, hideStudentMemorizationAmount: checked })} />
            <SettingToggle label="إخفاء المراجعة" checked={settings.hideStudentReviewAmount !== false} onCheckedChange={(checked) => setSettings({ ...settings, hideStudentReviewAmount: checked })} />
            <SettingToggle label="إخفاء الربط" checked={settings.hideStudentLinkAmount !== false} onCheckedChange={(checked) => setSettings({ ...settings, hideStudentLinkAmount: checked })} />
          </SettingsGroup>}
          <SettingsGroup>
            <h3 className="text-sm font-black text-primary">أيام الإجازة الأسبوعية</h3>
            <MultiSelectSetting
              value={settings.weeklyHolidayDays || []}
              options={weekDays}
              placeholder="اختر أيام الإجازة"
              onToggle={(value) => toggleListValue('weeklyHolidayDays', value)}
            />
            <div className="space-y-2">
              <Label>أيام جلسات التسميع</Label>
              <MultiSelectSetting
                value={settings.recitationSessionDays || []}
                options={weekDays}
                placeholder="اختر أيام جلسات التسميع"
                onToggle={(value) => toggleListValue('recitationSessionDays', value)}
              />
            </div>
            <div className="space-y-2">
              <Label>ماذا تريد في الإجازة؟</Label>
              <MultiSelectSetting
                value={settings.holidayTaskTypes || []}
                options={holidayTaskTypes}
                placeholder="لا شيء"
                onToggle={(value) => toggleListValue('holidayTaskTypes', value)}
              />
            </div>
            {!settings.nazemIntegrationEnabled && (
              <div className="space-y-2">
                <Label>المقادير التي تظهر في جلسة التسميع</Label>
                <Select
                  value={settings.recitationAmountDay || 'previous_day'}
                  onValueChange={(value) => setSettings({ ...settings, recitationAmountDay: value })}
                >
                  <SelectTrigger aria-label="المقادير التي تظهر في جلسة التسميع" className="border-primary/30 bg-card"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="previous_day">المقادير المقررة حتى اليوم السابق للجلسة</SelectItem>
                    <SelectItem value="same_day">المقادير المقررة حتى يوم الجلسة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </SettingsGroup>

          <StaffAttendanceSettings settings={settings} setSettings={setSettings} />

          <SettingsGroup>
            <h3 className="text-sm font-black text-primary">جلسات التسميع</h3>
            {!settings.nazemIntegrationEnabled && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>تنفيذ الحفظ عن طريق</Label>
                  <Select value="teacher" disabled>
                    <SelectTrigger aria-label="طريقة تنفيذ الحفظ" className="border-primary/30 bg-card"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="teacher">المعلم في جلسة التسميع</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>تحضير الطلاب عن طريق</Label>
                  <Select
                    value={settings.recitationAttendanceSource || 'supervisor'}
                    onValueChange={(value) => setSettings({
                      ...settings,
                      recitationAttendanceSource: value,
                      attendanceManualEnabled: value !== 'teacher',
                      automaticExecutionMessageEnabled: value === 'teacher'
                        ? false
                        : settings.automaticExecutionMessageEnabled,
                    })}
                  >
                    <SelectTrigger aria-label="طريقة التحضير" className="border-primary/30 bg-card"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="supervisor">المشرف</SelectItem>
                      <SelectItem value="teacher">المعلم</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[
                ['memorizationExecutionSource', 'تنفيذ الحفظ والإتقان والتكرار والسماع عن طريق'],
                ['reviewExecutionSource', 'تنفيذ المراجعة عن طريق'],
                ['linkExecutionSource', 'تنفيذ الربط عن طريق'],
              ]
                .map(([key, label]) => (
                  <div key={key} className="space-y-2">
                    <Label>{label}</Label>
                    <Select value={settings[key] || 'both'} onValueChange={(value) => setSettings({ ...settings, [key]: value })}>
                      <SelectTrigger aria-label={label} className="border-primary/30 bg-card"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="student">الطالب</SelectItem>
                        <SelectItem value="teacher">المعلم</SelectItem>
                        <SelectItem value="both">الطالب أو المعلم — الأسبق يعتمد</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
            </div>
            {['student', 'both'].includes(settings.memorizationExecutionSource) && (
              <SettingToggle
                label="السماح للطالب بتقليل مقدار حفظ اليوم"
                checked={Boolean(settings.studentTaskAmountEditable)}
                onCheckedChange={(checked) => setSettings({ ...settings, studentTaskAmountEditable: checked })}
              />
            )}
            {['student', 'both'].includes(settings.reviewExecutionSource) && (
              <SettingToggle
                label="السماح للطالب بتعديل مقدار المراجعة"
                checked={Boolean(settings.studentReviewAmountEditable)}
                onCheckedChange={(checked) => setSettings({ ...settings, studentReviewAmountEditable: checked })}
              />
            )}
            {['student', 'both'].includes(settings.linkExecutionSource) && (
              <SettingToggle
                label="السماح للطالب بتعديل مقدار الربط"
                checked={Boolean(settings.studentLinkAmountEditable)}
                onCheckedChange={(checked) => setSettings({ ...settings, studentLinkAmountEditable: checked })}
              />
            )}
            {['student', 'both'].includes(settings.memorizationExecutionSource) && (
              <div className="grid gap-3 sm:grid-cols-2">
                <SettingToggle
                  label="السماح للطالب بتعديل عدد التكرارات"
                  checked={Boolean(settings.allowRepeatCountEditing)}
                  onCheckedChange={(checked) => setSettings({ ...settings, allowRepeatCountEditing: checked })}
                />
                <SettingToggle
                  label="السماح للطالب بتعديل عدد مرات السماع"
                  checked={Boolean(settings.allowListeningCountEditing)}
                  onCheckedChange={(checked) => setSettings({ ...settings, allowListeningCountEditing: checked })}
                />
              </div>
            )}
            <div className="space-y-3">
                <h3 className="text-sm font-black text-primary">التعويض والزيادة</h3>
                <InlineToggleNumberSetting
                  label="السماح بإكمال الحفظ المتأخر (التعويض)"
                  inputLabel="نسبة التعويض بالمئة"
                  checked={Boolean(settings.allowQuranCompensation)}
                  onCheckedChange={(checked) => setSettings({ ...settings, allowQuranCompensation: checked })}
                  value={settings.quranCompensationPointsPercent ?? 100}
                  onValueChange={(value) => setSettings({ ...settings, quranCompensationPointsPercent: value })}
                  valueLabel={rewardUnits.text('نسبة الكيلومترات عند التعويض')}
                  suffix="%"
                />
                <InlineToggleNumberSetting
                  label="السماح بتجاوز مقدار اليوم والتقدم في الخطة"
                  inputLabel={rewardUnits.text('نسبة كيلومترات زيادة الحفظ اليومي')}
                  checked={Boolean(settings.allowQuranExtra)}
                  onCheckedChange={(checked) => setSettings({ ...settings, allowQuranExtra: checked })}
                  value={settings.quranExtraPointsPercent ?? 50}
                  onValueChange={(value) => setSettings({ ...settings, quranExtraPointsPercent: value })}
                  valueLabel={rewardUnits.text('نسبة الكيلومترات عند الزيادة')}
                  suffix="%"
                />
            </div>
          </SettingsGroup>

          <SettingsGroup>
            <h3 className="text-sm font-black text-primary">ضوابط التسميع</h3>
            <div className="space-y-2">
              <Label>المسار</Label>
              <Select
                value={evaluationType}
                onValueChange={(value) => {
                  setEvaluationType(value);
                  setEvaluationUnit('face');
                }}
              >
                <SelectTrigger aria-label="مسار ضوابط التسميع" className="border-primary/30 bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {teacherEvaluationTypes.map(({ key, label }) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {supportsFractionalFaces && (
              <EvaluationUnitSelector value={evaluationUnit} onChange={setEvaluationUnit} />
            )}
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-primary/15 bg-card p-4 sm:grid-cols-4">
              <div className="col-span-2 flex justify-end sm:col-span-4">
                {selectedEvaluationType.showsScalingHelp ? (
                  <EvaluationScalingHelp type={selectedEvaluationType.key} />
                ) : (
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-black text-primary">
                    {evaluationUnitLabel}
                  </span>
                )}
              </div>
              <ScoreSettingField
                label={rewardUnits.text('أصل الدرجة والكيلومترات')}
                settingKey={`${evaluationSettingPrefix}MaxScore`}
                settings={settings}
                setSettings={setSettings}
                min={1}
                onValueChange={(value) => setSettings((current) => (
                  updateEvaluationMaxScore(current, evaluationSettingPrefix, value)
                ))}
              />
              <ScoreSettingField label="خصم الخطأ" settingKey={`${evaluationSettingPrefix}MistakeDeduction`} settings={settings} setSettings={setSettings} />
              <ScoreSettingField label="خصم التنبيه" settingKey={`${evaluationSettingPrefix}WarningDeduction`} settings={settings} setSettings={setSettings} />
              <ScoreSettingField label="حد النجاح" settingKey={`${evaluationSettingPrefix}PassingScore`} settings={settings} setSettings={setSettings} min={1} />
              {selectedEvaluationType.repeatKey && (
                settings.nazemIntegrationEnabled ? (
                  <ScoreSettingField
                    label={rewardUnits.text('كيلومترات كل تكرار')}
                    settingKey={selectedEvaluationType.repeatPointsKey}
                    settings={settings}
                    setSettings={setSettings}
                  />
                ) : (
                  <CountPointsSettingField
                    label="عدد التكرارات"
                    countKey={selectedEvaluationType.repeatKey}
                    pointsKey={selectedEvaluationType.repeatPointsKey}
                    unitLabel="تكرار"
                    settings={settings}
                    setSettings={setSettings}
                    defaultCount={1}
                    defaultPoints={1}
                  />
                )
              )}
              {selectedEvaluationType.listeningKey && (
                settings.nazemIntegrationEnabled ? (
                  <ScoreSettingField
                    label={rewardUnits.text('كيلومترات السماع عند اختيار نعم')}
                    settingKey={selectedEvaluationType.listeningPointsKey}
                    settings={settings}
                    setSettings={setSettings}
                  />
                ) : (
                  <CountPointsSettingField
                    label="عدد مرات السماع"
                    countKey={selectedEvaluationType.listeningKey}
                    pointsKey={selectedEvaluationType.listeningPointsKey}
                    unitLabel="سماع"
                    settings={settings}
                    setSettings={setSettings}
                    defaultCount={3}
                    defaultPoints={10}
                  />
                )
              )}
            </div>
          </SettingsGroup>

          <SettingsGroup>
              <h3 className="text-sm font-black text-primary">طريقة عرض مقدار القرآن</h3>
              <Select
                value={settings.quranReferenceMode || 'ayah'}
                onValueChange={(value) => setSettings({ ...settings, quranReferenceMode: value })}
              >
                <SelectTrigger aria-label="طريقة عرض مقدار القرآن" className="border-primary/30 bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ayah">السورة والآية</SelectItem>
                  <SelectItem value="page">أرقام الصفحات</SelectItem>
                </SelectContent>
              </Select>
          </SettingsGroup>

          {settings.pointsSystemEnabled && <SettingsGroup>
            <h3 className="text-sm font-black text-primary">{rewardUnits.text('كيلومترات التحضير')}</h3>
            <div className="grid gap-3 rounded-xl border border-primary/15 bg-card p-4 sm:grid-cols-3">
              <ScoreSettingField
                label={rewardUnits.text('كيلومترات الحضور')}
                settingKey="attendancePoints"
                settings={settings}
                setSettings={setSettings}
              />
              <ScoreSettingField
                label={rewardUnits.text('كيلومترات التأخير')}
                settingKey="manualLateAttendancePoints"
                settings={settings}
                setSettings={setSettings}
              />
              <ScoreSettingField
                label={rewardUnits.text('كيلومترات الاستئذان')}
                settingKey="excusedAttendancePoints"
                settings={settings}
                setSettings={setSettings}
              />
            </div>
          </SettingsGroup>}

          <SettingsGroup>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-black text-primary">قوالب التحضير والتنفيذ</h3>
              <TemplateVariablesHint />
            </div>
            <div className="space-y-5">
              <MessageTemplateField
                id="attendance-absent-template"
                label="قالب رسالة الغياب"
                value={settings.attendanceAbsentTemplate || ''}
                onChange={(value) => setSettings({ ...settings, attendanceAbsentTemplate: value })}
                placeholder="استخدم {name} و {date} و {committee}"
                action={(
                  <ToggleSwitch
                    ariaLabel="الإرسال التلقائي لرسالة الغياب"
                    checked={settings.automaticAbsenceMessageEnabled}
                    onCheckedChange={(checked) => setSettings({
                      ...settings,
                      automaticAbsenceMessageEnabled: checked,
                    })}
                  />
                )}
              />

              {[
                settings.memorizationExecutionSource,
                settings.reviewExecutionSource,
                settings.linkExecutionSource,
              ]
                .some((source) => ['student', 'both'].includes(source)) && (
                <>
                  <MessageTemplateField
                    id="execution-reminder-template"
                    label="قالب رسالة عدم التنفيذ"
                    value={settings.executionReminderTemplate || ''}
                    onChange={(value) => setSettings({ ...settings, executionReminderTemplate: value })}
                    placeholder="استخدم {name} و {date} و {tasks}"
                    action={(
                      <ToggleSwitch
                        ariaLabel="الإرسال التلقائي لرسالة عدم التنفيذ"
                        checked={settings.automaticExecutionMessageEnabled}
                        onCheckedChange={(checked) => setSettings({
                          ...settings,
                          automaticExecutionMessageEnabled: checked,
                        })}
                      />
                    )}
                  />
                  <div className="space-y-2">
                    <Label>استثناء طلاب</Label>
                    <MultiSelectSetting
                      value={settings.executionReminderExcludedStudentIds || []}
                      options={executionReminderStudents.map((student) => ({
                        value: student.id,
                        label: student.committeeName
                          ? `${student.name} — ${student.committeeName}`
                          : student.name,
                      }))}
                      placeholder="اختر الطلاب المستثنين من رسالة عدم التنفيذ"
                      onToggle={(studentId) => toggleListValue('executionReminderExcludedStudentIds', studentId)}
                    />
                  </div>
                </>
              )}
            </div>
          </SettingsGroup>
          </SettingsCategoryPanel>

          <SettingsCategoryPanel category="settingsNarration" activeCategory={activeCategory} title="يوم السرد والاختبار">
          <SettingsGroup>
            <h3 className="text-sm font-black text-primary">إعدادات الاختبار</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="quran-test-max-score">أصل الدرجة</Label>
                <Input id="quran-test-max-score" type="number" min="1" value={settings.quranTestMaxScore} onChange={(event) => setSettings({ ...settings, quranTestMaxScore: Number(event.target.value || 100) })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="quran-test-passing-score">درجة النجاح</Label>
                <Input id="quran-test-passing-score" type="number" min="0" value={settings.quranTestPassingScore} onChange={(event) => setSettings({ ...settings, quranTestPassingScore: Number(event.target.value || 0) })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="quran-test-retest-score">حد إعادة الاختبار</Label>
                <Input id="quran-test-retest-score" type="number" min="0" value={settings.quranTestRetestScore} onChange={(event) => setSettings({ ...settings, quranTestRetestScore: Number(event.target.value || 0) })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="quran-test-warning-deduction">خصم التنبيه</Label>
                <Input id="quran-test-warning-deduction" type="number" min="0" value={settings.quranTestWarningDeduction} onChange={(event) => setSettings({ ...settings, quranTestWarningDeduction: Number(event.target.value || 0) })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="quran-test-mistake-deduction">خصم الخطأ</Label>
                <Input id="quran-test-mistake-deduction" type="number" min="0" value={settings.quranTestMistakeDeduction} onChange={(event) => setSettings({ ...settings, quranTestMistakeDeduction: Number(event.target.value || 0) })} />
              </div>
            </div>
          </SettingsGroup>

          <SettingsGroup>
            <h3 className="text-sm font-black text-primary">إعدادات يوم السرد</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="narration-max-score">أصل الدرجة</Label>
                <Input id="narration-max-score" type="number" min="1" value={settings.narrationMaxScore} onChange={(event) => setSettings({ ...settings, narrationMaxScore: Number(event.target.value || 100) })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="narration-warning-deduction">خصم التنبيه</Label>
                <Input id="narration-warning-deduction" type="number" min="0" value={settings.narrationWarningDeduction} onChange={(event) => setSettings({ ...settings, narrationWarningDeduction: Number(event.target.value || 0) })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="narration-mistake-deduction">خصم الخطأ</Label>
                <Input id="narration-mistake-deduction" type="number" min="0" value={settings.narrationMistakeDeduction} onChange={(event) => setSettings({ ...settings, narrationMistakeDeduction: Number(event.target.value || 0) })} />
              </div>
            </div>
          </SettingsGroup>

          <SettingsGroup>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-black text-primary">قوالب يوم السرد والاختبار</h3>
              <TemplateVariablesHint />
            </div>
            <div className="space-y-5">
              <MessageTemplateField
                id="quran-test-message-template"
                label="قالب موعد الاختبار"
                value={settings.quranTestMessageTemplate || ''}
                onChange={(value) => setSettings({ ...settings, quranTestMessageTemplate: value })}
                placeholder="استخدم {name} و {juz} و {date}"
              />
              <MessageTemplateField id="narration-start-template" label="قالب بداية يوم السرد" value={settings.narrationStartTemplate || ''} onChange={(value) => setSettings({ ...settings, narrationStartTemplate: value })} />
              <MessageTemplateField id="narration-end-template" label="قالب نهاية يوم السرد" value={settings.narrationEndTemplate || ''} onChange={(value) => setSettings({ ...settings, narrationEndTemplate: value })} />
              <MessageTemplateField id="narration-result-template" label="قالب نتيجة يوم السرد" value={settings.narrationResultTemplate || ''} onChange={(value) => setSettings({ ...settings, narrationResultTemplate: value })} />
            </div>
          </SettingsGroup>
          </SettingsCategoryPanel>

          <SettingsCategoryPanel category="settingsPoints" activeCategory={activeCategory} title={rewardUnits.text('الكيلومترات والترتيب')}>
          <SettingsGroup>
            <h3 className="text-sm font-black text-primary">{rewardUnits.text('الكيلومترات والترتيب')}</h3>
            <div className="space-y-3">
              <SettingToggle
                label={rewardUnits.text('نظام الكيلومترات')}
                checked={settings.pointsSystemEnabled}
                onCheckedChange={(checked) => setSettings(enforcePointsFeatureDependencies({
                  ...settings,
                  pointsSystemEnabled: checked,
                }))}
              />
              {settings.pointsSystemEnabled && (
                <>
                  <SettingToggle
                    label="إظهار ترتيب الطلاب"
                    checked={settings.studentRankingsVisible}
                    onCheckedChange={(checked) => setSettings({ ...settings, studentRankingsVisible: checked })}
                  />
                  <SettingToggle
                    label="إظهار ترتيب الحلقات"
                    checked={settings.familyRankingsVisible}
                    onCheckedChange={(checked) => setSettings({ ...settings, familyRankingsVisible: checked })}
                  />
                  {settings.familyRankingsVisible && (
                    <div className="space-y-2 rounded-xl border border-border/70 bg-card/65 p-3">
                      <Label htmlFor="family-ranking-mode">طريقة احتساب ترتيب الحلقات</Label>
                      <Select
                        value={settings.familyRankingMode === 'average' ? 'average' : 'total'}
                        onValueChange={(value) => setSettings({ ...settings, familyRankingMode: value })}
                      >
                        <SelectTrigger id="family-ranking-mode" className="min-h-12 touch-manipulation">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="total">{rewardUnits.text('إجمالي نقاط الحلقة')}</SelectItem>
                          <SelectItem value="average">{rewardUnits.text('متوسط نقاط الطلاب')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {(settings.studentRankingsVisible || settings.familyRankingsVisible) && (
                    <SettingToggle
                      label={rewardUnits.text('إظهار الكيلومترات في الترتيب')}
                      checked={settings.rankingPointsVisible}
                      onCheckedChange={(checked) => setSettings({ ...settings, rankingPointsVisible: checked })}
                    />
                  )}
                  <InlineToggleNumberSetting
                    label="السماح للمعلم بالإضافة والخصم"
                    checked={settings.teacherManualPointsEnabled}
                    onCheckedChange={(checked) => setSettings({ ...settings, teacherManualPointsEnabled: checked })}
                    value={settings.teacherManualPointsTermLimit}
                    onValueChange={(value) => setSettings({ ...settings, teacherManualPointsTermLimit: value })}
                    inputLabel="حد المعلم في الفصل"
                    valueLabel="الحد في الفصل"
                    min={1}
                    max={1000000}
                  />
                  {settings.teacherManualPointsEnabled && (
                    <TeacherPointTypesSetting
                      value={settings.teacherPointTypes}
                      onChange={(teacherPointTypes) => setSettings({ ...settings, teacherPointTypes })}
                    />
                  )}
                </>
              )}
              {canResetPoints && (
                <div className="border-t border-border/70 pt-4">
                  <ResetPointsDialog rewardUnit={rewardUnits.plural} />
                </div>
              )}
            </div>
          </SettingsGroup>
          </SettingsCategoryPanel>

          <SettingsCategoryPanel category="settingsMap" activeCategory={activeCategory} title="الخريطة والتحدي اليومي">
          <SettingsGroup>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-black text-primary">التحدي اليومي</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11 min-w-20 border-primary/30"
                onClick={() => setDailyChallengePreviewOpen(true)}
              >
                تجربة
              </Button>
            </div>
            <div className="space-y-3">
              <InlineToggleNumberSetting
                label="تفعيل التحدي اليومي"
                checked={settings.dailyChallengeEnabled}
                onCheckedChange={(checked) => setSettings({ ...settings, dailyChallengeEnabled: checked })}
                value={settings.dailyChallengePoints}
                valueLabel="مكافأة الفوز:"
                inputLabel="مكافأة الفوز في التحدي اليومي"
                onValueChange={(value) => setSettings({ ...settings, dailyChallengePoints: value })}
                min={0}
                max={10000}
                showValue={settings.dailyChallengeEnabled && settings.pointsSystemEnabled}
              />
              {settings.dailyChallengeEnabled && (
                <>
                  <div className="space-y-2">
                    <Label>الألعاب المتاحة</Label>
                    <MultiSelectSetting
                      value={settings.dailyChallengeGames}
                      options={DAILY_CHALLENGE_GAMES}
                      placeholder="اختر ألعاب التحدي"
                      onToggle={(value) => toggleListValue('dailyChallengeGames', value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>أيام التحدي</Label>
                    <MultiSelectSetting
                      value={settings.dailyChallengeDays}
                      options={DAILY_CHALLENGE_WEEK_DAYS}
                      placeholder="اختر أيام التحدي"
                      onToggle={(value) => toggleListValue('dailyChallengeDays', value)}
                    />
                  </div>
                </>
              )}
            </div>
          </SettingsGroup>

          <SettingsGroup>
            <h3 className="text-sm font-black text-primary">الخريطة</h3>
            <div className="space-y-3">
              <SettingToggle
                label="تفعيل الخريطة"
                checked={settings.summitEnabled}
                onCheckedChange={(checked) => setSettings((current) => enforcePointsFeatureDependencies({
                  ...current,
                  pointsSystemEnabled: checked ? true : current.pointsSystemEnabled,
                  summitEnabled: checked,
                }))}
              />
              {settings.summitEnabled && (
                <SummitMapEditor
                  value={settings.summitMapConfig}
                  onChange={(summitMapConfig) => setSettings((current) => ({ ...current, summitMapConfig }))}
                />
              )}
            </div>
          </SettingsGroup>
          </SettingsCategoryPanel>

          <SettingsCategoryPanel category="settingsNazem" activeCategory={activeCategory} title="ناظم">
            <NazemIntegrationSettings onConfigChange={(enabled, recitationAmountDay) => setSettings((current) => ({
              ...current,
              nazemIntegrationEnabled: enabled,
              recitationAmountDay: recitationAmountDay || (enabled ? 'same_day' : current.recitationAmountDay),
            }))} />
          </SettingsCategoryPanel>

          <SettingsCategoryPanel category="settingsTerm" activeCategory={activeCategory} title="إنهاء الفصل وطلبات الحذف">
          {canManageDeletionRequests && <SettingsGroup><AccountPolicyLinks /></SettingsGroup>}
          {settings.termClosureSectionEnabled !== false && <SettingsGroup>
            <h3 className="text-sm font-black text-primary">إنهاء الفصل</h3>
            <p className="text-sm font-bold leading-7 text-muted-foreground">
              {rewardUnits.text(termClosureSummary)}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setEndTermOpen(true)}>
                إنهاء الفصل والبدء بفصل جديد
              </Button>
            </div>
          </SettingsGroup>}
          {canManageDeletionRequests && settings.deletionRequestsSectionEnabled !== false && (
            <SettingsGroup>
              <h3 className="text-sm font-black text-primary">طلبات الحذف</h3>
              <AccountDeletionRequestsDialog triggerClassName="w-auto px-3 text-xs sm:text-sm" />
            </SettingsGroup>
          )}
          </SettingsCategoryPanel>
        </CardContent>
      </Card>
      <DailyChallengePreviewDialog
        open={dailyChallengePreviewOpen}
        onOpenChange={setDailyChallengePreviewOpen}
        points={settings.pointsSystemEnabled ? settings.dailyChallengePoints : 0}
        selectedGames={settings.dailyChallengeGames}
      />

      <div className="pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] z-40">
        <output  aria-live="polite" className={`inline-flex h-11 items-center gap-2 rounded-lg border px-4 text-sm font-bold shadow-xl ${
          saveStatus === 'error'
            ? 'border-destructive/40 bg-destructive/10 text-destructive'
            : 'border-primary/20 bg-card text-muted-foreground'
        }`}>
          {isSaving ? <LoadingSpinner className="text-primary" /> : <CheckCircle2 className="h-4 w-4 text-primary" />}
          {_resolveSettingsSection()}
        </output>
      </div>

      <EndTermDialog {...{ endTermOpen, setEndTermOpen, rewardUnits, termClosureSummary, endTermConfirmText, setEndTermConfirmText, endTerm, isEndingTerm }} />
    </div>
  );
};

const ScoreSettingField = ({ label, settingKey, settings, setSettings, min = 0, onValueChange }) => (
  <div className="space-y-1.5">
    <Label htmlFor={`setting-${settingKey}`} className="text-xs sm:text-sm">{label}</Label>
    <Input
      id={`setting-${settingKey}`}
      type="number"
      min={min}
      step="any"
      value={settings[settingKey]}
      onChange={(event) => {
        const value = Math.max(min, Number(event.target.value || min));
        if (onValueChange) {
          onValueChange(value);
          return;
        }
        setSettings({ ...settings, [settingKey]: value });
      }}
    />
  </div>
);

export default SettingsSection;
