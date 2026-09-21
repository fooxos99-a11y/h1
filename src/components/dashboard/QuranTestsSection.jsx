import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ClipboardCheck, Send } from 'lucide-react';
import { DashboardDatePicker, DashboardSecondaryButton } from '@/components/dashboard/DashboardControls';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import QuranTestAppointmentsDialog from '@/components/dashboard/QuranTestAppointmentsDialog';
import MushafRecitationDialog from '@/components/portal/MushafRecitationDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ErrorState from '@/components/ui/error-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import {
  commitOfflineOperation,
  loadOfflineSnapshot,
  syncOfflineActions,
} from '@/services/offlineOperationsService';
import { studentsApi } from '@/services/studentsApi';
import { getBusinessDate } from '../../../shared/business-date.js';

const today = getBusinessDate;

const getCommitteeId = (row) => String(row?.committeeId ?? row?.student?.committeeId ?? 'none');
const getCommitteeName = (row) => row?.committeeName || row?.student?.committeeName || 'بدون حلقة';
const getAccountId = () => Number(localStorage.getItem('wajeh_supervisor_id') || 0);

const QuranTestsSection = () => {
  const { toast } = useToast();
  const [students, setStudents] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [settings, setSettings] = useState(null);
  const [date] = useState(today());
  const [committeeFilter, setCommitteeFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const hasLoaded = useRef(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [appointmentsOpen, setAppointmentsOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [mushafOpen, setMushafOpen] = useState(false);
  const [form, setForm] = useState({ juzNumber: '', scheduledDate: today(), warningsCount: 0, mistakesCount: 0, rescheduleDate: today() });
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async ({ preferCache = !hasLoaded.current } = {}) => {
    if (!hasLoaded.current) setIsLoading(true);
    setLoadError('');
    try {
      const [studentRows, settingRows, appointmentRows] = await Promise.all([
        loadOfflineSnapshot(getAccountId(), 'quran-tests:students', () => studentsApi.getQuranTestStudents(), {
          preferCache,
          onRefresh: setStudents,
        }),
        loadOfflineSnapshot(getAccountId(), 'quran-tests:settings', () => studentsApi.getSettings(), {
          preferCache,
          onRefresh: setSettings,
        }),
        loadOfflineSnapshot(getAccountId(), `quran-tests:schedule:${date}`, () => studentsApi.getQuranTestSchedule({ date }), {
          preferCache,
          onRefresh: setAppointments,
        }),
      ]);
      setStudents(studentRows);
      setSettings(settingRows);
      setAppointments(appointmentRows);
    } catch (error) {
      setLoadError(error.message || 'تعذر تحميل الاختبارات.');
      toast({ title: 'تعذر تحميل الاختبارات', description: error.message, variant: 'destructive' });
    } finally {
      hasLoaded.current = true;
      setIsLoading(false);
    }
  }, [date, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const openSchedule = (student) => {
    setSelectedStudent(student);
    setForm({ juzNumber: String(student.availableJuzs?.[0]?.juz || ''), scheduledDate: date || today(), warningsCount: 0, mistakesCount: 0, rescheduleDate: date || today() });
    setScheduleOpen(true);
  };

  const openTest = (student, appointment = null) => {
    const appointmentJuz = appointment?.juz ? Number(appointment.juz) : null;
    const availableJuzs = [...(student.availableJuzs || [])];
    if (appointmentJuz && !availableJuzs.some((juz) => Number(juz.juz) === appointmentJuz)) {
      availableJuzs.push({ juz: appointmentJuz, label: appointment.juzLabel || `الجزء ${appointmentJuz}` });
    }
    setSelectedStudent({ ...student, availableJuzs });
    setForm({
      juzNumber: String(appointmentJuz || student.availableJuzs?.[0]?.juz || ''),
      scheduledDate: appointment?.scheduledDate || date || today(),
      warningsCount: 0,
      mistakesCount: 0,
      rescheduleDate: today(),
    });
    setTestOpen(true);
  };

  const selectedJuzs = selectedStudent?.availableJuzs || [];
  const maxScore = Number(settings?.quranTestMaxScore || 100);
  const passingScore = Number(settings?.quranTestPassingScore || 85);
  const retestScore = Number(settings?.quranTestRetestScore || 60);
  const score = Math.max(0, maxScore
    - (Number(form.warningsCount || 0) * Number(settings?.quranTestWarningDeduction || 0))
    - (Number(form.mistakesCount || 0) * Number(settings?.quranTestMistakeDeduction || 0)));
  const isPassing = score >= passingScore;
  const requiresRetest = !isPassing && score >= retestScore;

  const sendSchedule = async () => {
    if (!selectedStudent || !form.juzNumber || !form.scheduledDate) return;
    setIsSaving(true);
    try {
      const result = await studentsApi.scheduleQuranTest({
        studentId: selectedStudent.id,
        juzNumber: Number(form.juzNumber),
        scheduledDate: form.scheduledDate,
      });
      toast({
        title: result.sent ? 'تم إرسال الموعد' : 'تعذر إرسال الموعد',
        description: result.sent ? 'تم إرسال رسالة واتساب.' : (result.failureReason || 'لم يتم إرسال واتساب.'),
        variant: result.sent ? 'default' : 'destructive',
      });
      setScheduleOpen(false);
      await load({ preferCache: false });
    } catch (error) {
      toast({ title: 'تعذر إرسال الموعد', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const persistResult = async (evaluationPayload = {}) => {
    if (!selectedStudent || !form.juzNumber) return;
    if (requiresRetest && !form.rescheduleDate) {
      toast({ title: 'اختر موعد الإعادة', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        studentId: selectedStudent.id,
        juzNumber: Number(form.juzNumber),
        scheduledDate: form.scheduledDate,
        warningsCount: Number(form.warningsCount || 0),
        mistakesCount: Number(form.mistakesCount || 0),
        rescheduleDate: form.rescheduleDate,
        evaluationMode: 'count',
        ...evaluationPayload,
      };
      const action = await commitOfflineOperation(
        getAccountId(),
        'quran_test_result',
        payload,
        { dedupeKey: `quran-test:${payload.studentId}:${payload.juzNumber}:${payload.scheduledDate || today()}` },
      );
      const synced = navigator.onLine === false
        ? null
        : (await syncOfflineActions(getAccountId(), { force: true })).find((item) => item.actionId === action.actionId);
      if (synced?.status?.startsWith('rejected_')) throw new Error(synced.lastError || 'رفض السيرفر نتيجة الاختبار.');
      const result = synced?.status === 'synced' ? synced.result : {
        score,
        resultType: isPassing ? 'passed' : (requiresRetest ? 'retest' : 'repeat_memorization'),
        pendingSync: true,
      };
      const resultTitle = result.resultType === 'passed'
        ? 'الطالب ناجح'
        : (result.resultType === 'retest' ? 'تم تحديد إعادة الاختبار' : 'تمت إعادة الحفظ');
      toast({
        title: result.pendingSync ? 'حُفظت نتيجة الاختبار محليًا' : resultTitle,
        description: `الدرجة: ${result.score}${result.pendingSync ? ' — تنتظر المزامنة' : ''}`,
      });
      setTestOpen(false);
      if (!result.pendingSync) await load({ preferCache: false });
      return { ...result, teacherCompleted: result.resultType === 'passed' };
    } catch (error) {
      toast({ title: 'تعذر حفظ الاختبار', description: error.message, variant: 'destructive' });
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  const saveResult = () => persistResult().catch(() => undefined);
  const openMushafTest = async () => {
    if (!selectedStudent || !form.juzNumber) return;
    setIsSaving(true);
    try {
      await studentsApi.startQuranTest({ studentId: selectedStudent.id, juzNumber: Number(form.juzNumber) });
      setTestOpen(false);
      setMushafOpen(true);
    } catch (error) {
      toast({ title: 'تعذر بدء الاختبار', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };
  const mushafTask = useMemo(() => form.juzNumber ? [{
    id: Number(form.juzNumber),
    fromSurahName: `الجزء ${form.juzNumber}`,
  }] : [], [form.juzNumber]);
  const loadMushafTask = useCallback(
    () => loadOfflineSnapshot(
      getAccountId(),
      `quran-tests:ayahs:${selectedStudent?.id}:${form.juzNumber}`,
      () => studentsApi.getQuranTestJuzAyahs(selectedStudent?.id, form.juzNumber),
    ),
    [form.juzNumber, selectedStudent?.id]
  );
  const saveMushafTask = (_task, payload) => persistResult({ evaluationMode: 'mushaf', wordMarks: payload.wordMarks, samplePages: payload.samplePages });

  const appointmentStudents = useMemo(() => {
    const byId = new Map(students.map((student) => [Number(student.id), student]));
    const uniqueAppointments = new Map();
    appointments.forEach((appointment) => {
      uniqueAppointments.set(`${appointment.studentId}:${appointment.juz}`, appointment);
    });
    return Array.from(uniqueAppointments.values()).map((appointment) => ({
      ...appointment,
      student: byId.get(Number(appointment.studentId)) || {
        id: appointment.studentId,
        name: appointment.studentName,
        committeeId: appointment.committeeId,
        committeeName: appointment.committeeName,
        availableJuzs: [{ juz: appointment.juz, label: appointment.juzLabel }],
      },
    }));
  }, [appointments, students]);

  const sourceRows = students;
  const committeeOptions = useMemo(() => {
    const map = new Map();
    sourceRows.forEach((row) => {
      const id = getCommitteeId(row);
      if (!map.has(id)) map.set(id, { id, name: getCommitteeName(row) });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [sourceRows]);
  const rowsAfterCommittee = useMemo(() => (
    committeeFilter === 'all'
      ? sourceRows
      : sourceRows.filter((row) => getCommitteeId(row) === committeeFilter)
  ), [committeeFilter, sourceRows]);
  const rows = rowsAfterCommittee;
  const filteredAppointmentRows = useMemo(() => appointmentStudents.filter((row) => (
    committeeFilter === 'all' || getCommitteeId(row) === committeeFilter
  )), [appointmentStudents, committeeFilter]);

  useEffect(() => {
    const validCommittees = new Set(committeeOptions.map((option) => option.id));
    if (committeeFilter !== 'all' && !validCommittees.has(committeeFilter)) {
      setCommitteeFilter('all');
    }
  }, [committeeFilter, committeeOptions]);

  if (isLoading) return <DashboardLoader className="min-h-[420px]" />;
  if (loadError && !students.length) return <ErrorState message={loadError} onRetry={() => load({ preferCache: false })} />;

  return (
    <Card className="border-primary/30 bg-card neon-glow">
      <CardHeader className="border-b border-primary/15 p-4">
        <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 sm:max-w-xl sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-3" dir="rtl">
          <Select
            value={committeeFilter}
            onValueChange={setCommitteeFilter}
          >
            <SelectTrigger aria-label="الحلقة" className="h-11 w-full min-w-0 border-primary/30 bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحلقات</SelectItem>
              {committeeOptions.map((committee) => (
                <SelectItem key={committee.id} value={committee.id}>{committee.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DashboardSecondaryButton className="w-full gap-2 sm:w-auto" onClick={() => setAppointmentsOpen(true)}>
            <CalendarDays className="h-4 w-4" />
            المواعيد
          </DashboardSecondaryButton>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-primary/20 p-8 text-center text-muted-foreground">
            لا يوجد طلاب لديهم أجزاء غير مختبرة.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((student) => (
              <div key={student.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-primary/15 bg-background/70 p-3">
                <div className="min-w-0">
                  <div className="text-lg font-black text-foreground">{student.name}</div>
                  <div className="text-xs font-bold text-muted-foreground">الأجزاء غير المختبرة: {student.availableJuzs?.length || 0}</div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="icon" variant="outline" onClick={() => openSchedule(student)} disabled={!student.availableJuzs?.length} title="إرسال موعد">
                    <Send className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="outline" onClick={() => openTest(student)} disabled={!student.availableJuzs?.length} title="اختبار">
                    <ClipboardCheck className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <QuranTestAppointmentsDialog
        open={appointmentsOpen}
        onOpenChange={setAppointmentsOpen}
        rows={filteredAppointmentRows}
        onOpenTest={(student, appointment) => {
          setAppointmentsOpen(false);
          openTest(student, appointment);
        }}
      />

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-lg bg-card border-primary/30 text-foreground" dir="rtl">
          <DialogHeader><DialogTitle className="text-primary neon-text">إرسال موعد اختبار</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="font-black text-foreground">{selectedStudent?.name}</div>
            <div className="space-y-2">
              <Label>الجزء</Label>
              <Select value={form.juzNumber} onValueChange={(value) => setForm({ ...form, juzNumber: value })}>
                <SelectTrigger aria-label="الجزء"><SelectValue placeholder="اختر الجزء" /></SelectTrigger>
                <SelectContent>{selectedJuzs.map((juz) => <SelectItem key={juz.juz} value={String(juz.juz)}>{juz.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>تاريخ الاختبار</Label>
              <DashboardDatePicker value={form.scheduledDate} onChange={(scheduledDate) => setForm({ ...form, scheduledDate })} ariaLabel="تاريخ الاختبار" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>إغلاق</Button>
            <Button onClick={sendSchedule} disabled={isSaving}>إرسال</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="max-w-lg bg-card border-primary/30 text-foreground" dir="rtl">
          <DialogHeader><DialogTitle className="text-primary neon-text">اختبار الطالب</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="font-black text-foreground">{selectedStudent?.name}</div>
            <div className="space-y-2">
              <Label>الجزء</Label>
              <Select value={form.juzNumber} onValueChange={(value) => setForm({ ...form, juzNumber: value })}>
                <SelectTrigger aria-label="الجزء"><SelectValue placeholder="اختر الجزء" /></SelectTrigger>
                <SelectContent>{selectedJuzs.map((juz) => <SelectItem key={juz.juz} value={String(juz.juz)}>{juz.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
              <div className="space-y-2">
                <Label>عدد التنبيهات</Label>
                <Input aria-label="عدد التنبيهات" type="number" min="0" value={form.warningsCount} onChange={(event) => setForm({ ...form, warningsCount: Number(event.target.value || 0) })} />
              </div>
              <div className="space-y-2">
                <Label>عدد الأخطاء</Label>
                <Input aria-label="عدد الأخطاء" type="number" min="0" value={form.mistakesCount} onChange={(event) => setForm({ ...form, mistakesCount: Number(event.target.value || 0) })} />
              </div>
            </div>
            <div className={`rounded-lg border p-3 text-sm font-black ${isPassing ? 'border-primary/20 bg-primary/10 text-primary' : 'border-destructive/30 bg-destructive/10 text-destructive'}`}>
              الدرجة: {score} / {maxScore} - {isPassing ? 'ناجح' : (requiresRetest ? 'إعادة اختبار' : 'إعادة حفظ')}
            </div>
            {requiresRetest && (
              <div className="space-y-2">
                <Label>تاريخ إعادة الاختبار</Label>
                <DashboardDatePicker
                  min={today()}
                  value={form.rescheduleDate}
                  onChange={(rescheduleDate) => setForm({ ...form, rescheduleDate })}
                  ariaLabel="تاريخ إعادة الاختبار"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestOpen(false)}>إغلاق</Button>
            <Button variant="outline" onClick={saveResult} disabled={isSaving || (requiresRetest && !form.rescheduleDate)}>النتيجة</Button>
            <Button onClick={openMushafTest} disabled={isSaving}>مقطع عشوائي</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MushafRecitationDialog
        tasks={mushafTask}
        open={mushafOpen}
        onOpenChange={setMushafOpen}
        loadTaskData={loadMushafTask}
        saveTaskResult={saveMushafTask}
        completionMessage="حُفظت نتيجة الاختبار وفق العلامات المسجلة."
        onSaved={() => load()}
        randomMode
      />
    </Card>
  );
};

export default QuranTestsSection;
