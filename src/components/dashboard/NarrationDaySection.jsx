import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, CheckCircle2, Plus, RotateCcw, Trash2, Users } from 'lucide-react';
import { DashboardDatePicker } from '@/components/dashboard/DashboardControls';
import DashboardMobileHeaderActions from '@/components/dashboard/DashboardMobileHeaderActions';
import NarrationStudentPanel from '@/components/dashboard/NarrationStudentPanel';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import CommitteeMultiSelect from '@/components/dashboard/CommitteeMultiSelect';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
const controlClassName = 'h-11 w-full min-w-0 border-primary/30 bg-background';
const getAccountId = () => Number(localStorage.getItem('wajeh_supervisor_id') || 0);
const summarizeStudents = (students = []) => ({
  total: students.length,
  completed: students.filter((student) => student.status === 'completed').length,
  inProgress: students.filter((student) => student.status === 'in_progress').length,
  pending: students.filter((student) => student.status === 'pending').length,
  absent: students.filter((student) => student.status === 'absent').length,
  excused: students.filter((student) => student.status === 'excused').length,
});

const NarrationDaySection = () => {
  const { toast } = useToast();
  const [events, setEvents] = useState([]);
  const [event, setEvent] = useState(null);
  const [committees, setCommittees] = useState([]);
  const [archiveId, setArchiveId] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [endScope, setEndScope] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [form, setForm] = useState({ name: '', startDate: today(), endDate: today(), committeeIds: ['all'] });

  const loadEvent = useCallback(async (id) => {
    if (!id) { setEvent(null); return; }
    setIsLoading(true);
    try {
      setEvent(await loadOfflineSnapshot(
        getAccountId(),
        `narration:event:${id}`,
        () => studentsApi.getNarrationEvent(id),
      ));
    }
    catch (error) { toast({ title: 'تعذر تحميل يوم السرد', description: error.message, variant: 'destructive' }); }
    finally { setIsLoading(false); }
  }, [toast]);

  const load = useCallback(async (preferredId = '') => {
    setIsLoading(true);
    try {
      const [rows, committeeRows] = await Promise.all([
        loadOfflineSnapshot(getAccountId(), 'narration:events', () => studentsApi.getNarrationEvents()),
        loadOfflineSnapshot(getAccountId(), 'narration:committees', () => studentsApi.getCommittees()),
      ]);
      setEvents(rows);
      setCommittees(committeeRows);
      const nextId = preferredId || rows.find((item) => item.status === 'open')?.id || '';
      const selected = rows.find((item) => String(item.id) === String(nextId));
      setArchiveId(selected?.status === 'archived' ? String(nextId) : '');
      if (nextId) await loadEvent(nextId); else setEvent(null);
    } catch (error) {
      toast({ title: 'تعذر تحميل أيام السرد', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [loadEvent, toast]);

  useEffect(() => { load(); }, [load]);

  const archivedEvents = events.filter((item) => item.status === 'archived');
  const activeStudents = useMemo(
    () => (event?.students || []).filter((student) => event?.status === 'archived' || !student.archivedAt),
    [event]
  );
  const eventCommittees = useMemo(() => {
    const items = new Map();
    activeStudents.forEach((student) => {
      if (student.committeeId && !items.has(String(student.committeeId))) {
        items.set(String(student.committeeId), student.committeeName || 'حلقة بلا اسم');
      }
    });
    return [...items.entries()].map(([id, name]) => ({ id, name }));
  }, [activeStudents]);
  const narrationSummary = useMemo(() => summarizeStudents(activeStudents), [activeStudents]);
  const endTargetStudents = useMemo(() => activeStudents.filter((student) => (
    endScope === 'all' || String(student.committeeId) === String(endScope)
  )), [activeStudents, endScope]);
  const endSummary = useMemo(() => summarizeStudents(endTargetStudents), [endTargetStudents]);

  const createEvent = async () => {
    setIsSaving(true);
    setCreateOpen(false);
    try {
      const result = await studentsApi.createNarrationEvent({
        ...form,
        scope: form.committeeIds.includes('all') ? 'all' : 'committee',
        committeeIds: form.committeeIds.includes('all') ? [] : form.committeeIds,
      });
      setArchiveId('');
      toast({ title: 'فُتح يوم السرد', description: `أضيف ${result.studentsCount} طالب وجارٍ إرسال رسالة البداية.` });
      const rows = await studentsApi.getNarrationEvents();
      setEvents(rows);
      await loadEvent(result.id);
    } catch (error) {
      setCreateOpen(true);
      toast({ title: 'تعذر فتح يوم السرد', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const refreshEvent = async () => {
    if (!event?.id) return;
    try {
      setEvent(await loadOfflineSnapshot(
        getAccountId(),
        `narration:event:${event.id}`,
        () => studentsApi.getNarrationEvent(event.id),
      ));
    }
    catch (error) { toast({ title: 'تعذر تحديث يوم السرد', description: error.message, variant: 'destructive' }); }
  };
  const savePart = async (partId, payload) => {
    try {
      const action = await commitOfflineOperation(
        getAccountId(),
        'narration_part',
        { eventId: event.id, partId, evaluation: payload },
        { dedupeKey: `narration-part:${event.id}:${partId}` },
      );
      const marks = Array.isArray(payload.wordMarks) ? payload.wordMarks : [];
      const warningCount = payload.evaluationMode === 'mushaf'
        ? marks.filter((mark) => mark.markType === 'warning').length
        : Number(payload.warningCount || 0);
      const mistakeCount = payload.evaluationMode === 'mushaf'
        ? marks.filter((mark) => mark.markType === 'mistake').length
        : Number(payload.mistakeCount || 0);
      const policy = event.evaluationPolicy || {};
      const localScore = Math.max(0, Number(policy.maxScore || 100)
        - warningCount * Number(policy.warningDeduction || 0)
        - mistakeCount * Number(policy.mistakeDeduction || 0));
      setEvent((current) => ({
        ...current,
        students: current.students.map((student) => {
          if (!student.parts.some((part) => String(part.id) === String(partId))) return student;
          const parts = student.parts.map((part) => String(part.id) === String(partId)
            ? { ...part, warningCount, mistakeCount, score: localScore, wordMarks: marks, pendingSync: true }
            : part);
          return { ...student, parts, status: parts.every((part) => part.score !== null) ? 'completed' : 'in_progress' };
        }),
      }));
      const synced = navigator.onLine === false
        ? null
        : (await syncOfflineActions(getAccountId(), { force: true })).find((item) => item.actionId === action.actionId);
      if (synced?.status?.startsWith('rejected_')) throw new Error(synced.lastError || 'رفض السيرفر تقييم السرد.');
      if (synced?.status === 'synced') await refreshEvent();
      toast({ title: synced?.status === 'synced' ? 'حُفظ التقييم' : 'حُفظ التقييم محليًا' });
      return synced?.result || { ok: true, score: localScore, pendingSync: true };
    }
    catch (error) { toast({ title: 'تعذر حفظ التقييم', description: error.message, variant: 'destructive' }); throw error; }
  };
  const startStudent = async (entryId) => {
    try {
      const action = await commitOfflineOperation(
        getAccountId(),
        'narration_student_status',
        { eventId: event.id, entryId, status: 'in_progress' },
        { dedupeKey: `narration-status:${event.id}:${entryId}` },
      );
      setEvent((current) => ({
        ...current,
        students: current.students.map((student) => String(student.id) === String(entryId)
          ? { ...student, status: 'in_progress', pendingSync: true }
          : student),
      }));
      if (navigator.onLine !== false) await syncOfflineActions(getAccountId(), { force: true });
      return action;
    }
    catch (error) { toast({ title: 'تعذر بدء التسميع', description: error.message, variant: 'destructive' }); }
  };
  const endNarration = async () => {
    setIsEnding(true);
    try {
      const result = await studentsApi.archiveNarrationEvent(event.id, {
        committeeId: endScope === 'all' ? null : endScope,
      });
      setEndOpen(false);
      const summary = result.archiveSummary || endSummary;
      toast({
        title: result.archivedAll ? 'تم إنهاء يوم السرد' : 'تم إنهاء سرد الحلقة',
        description: `حُفظت الحالة كما هي: أكمل ${summary.completed || 0}، لم يكمل ${summary.inProgress || 0}، لم يبدأ ${summary.pending || 0}، غائب ${summary.absent || 0}، مستأذن ${summary.excused || 0}.`,
      });
      if (result.archivedAll) await load(); else await refreshEvent();
    } catch (error) {
      toast({ title: 'تعذر إنهاء يوم السرد', description: error.message, variant: 'destructive' });
    } finally {
      setIsEnding(false);
    }
  };

  const selectArchive = (value) => {
    setArchiveId(value);
    setArchiveOpen(false);
    loadEvent(value);
  };

  const returnToCurrent = () => {
    setArchiveId('');
    load();
  };

  const deleteArchive = async () => {
    if (!archiveId || event?.status !== 'archived') return;
    setIsDeleting(true);
    try {
      await studentsApi.deleteNarrationEvent(archiveId);
      setDeleteOpen(false);
      setArchiveId('');
      toast({ title: 'تم حذف الأرشيف' });
      await load();
    } catch (error) {
      toast({ title: 'تعذر حذف الأرشيف', description: error.message, variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  const openEndDialog = () => {
    setEndScope('all');
    setEndOpen(true);
  };

  return (
    <>
      <DashboardMobileHeaderActions>
        <div className="flex items-center gap-1.5 sm:gap-2" dir="rtl">
          <Button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="h-11 w-11 gap-2 px-0 sm:w-auto sm:px-3"
            aria-label="فتح يوم سرد"
            title="فتح يوم سرد"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">فتح</span>
          </Button>
          {archiveId && events.some((item) => item.status === 'open') && (
            <Button type="button" variant="outline" onClick={returnToCurrent} className="h-11 w-11 gap-2 px-0 sm:w-auto sm:px-3" aria-label="العودة للسرد الحالي" title="العودة للسرد الحالي">
              <RotateCcw className="h-4 w-4" />
              <span className="hidden lg:inline">السرد الحالي</span>
            </Button>
          )}
          {event?.status === 'open' && (
            <Button type="button" variant="destructive" onClick={openEndDialog} className="h-11 w-11 gap-2 px-0 sm:w-auto sm:px-3" aria-label="إنهاء يوم السرد" title="إنهاء يوم السرد">
              <CheckCircle2 className="h-4 w-4" />
              <span className="hidden lg:inline">إنهاء</span>
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => setArchiveOpen(true)} disabled={!archivedEvents.length} className="h-11 w-11 gap-2 px-0 sm:w-auto sm:px-3" aria-label="أرشيف أيام السرد" title="أرشيف أيام السرد">
            <Archive className="h-4 w-4" />
            <span className="hidden lg:inline">الأرشيف</span>
          </Button>
        </div>
      </DashboardMobileHeaderActions>

      <Card className="border-primary/30 bg-card neon-glow" dir="rtl">
        <CardContent className="space-y-4 p-3 sm:p-4">
        {isSaving ? (
          <div className="flex min-h-[420px] flex-col items-center justify-center gap-3" role="status" aria-live="polite">
            <DashboardLoader className="min-h-24" />
            <p className="font-black text-primary [font-family:var(--font-ui)]">جاري تحميل يوم السرد</p>
          </div>
        ) : isLoading ? <DashboardLoader className="min-h-[420px]" /> : !event ? (
          <div className="rounded-lg border border-dashed border-primary/20 p-10 text-center font-bold text-muted-foreground">لا يوجد يوم سرد مفتوح.</div>
        ) : (
          <>
            <div className="rounded-lg border border-primary/15 bg-background/60 p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate text-lg font-black text-foreground">{event.name}</div>
                  <div className="mt-1 text-xs font-bold text-muted-foreground">{event.startDate} إلى {event.endDate}</div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm font-black">
                  <span className="flex items-center gap-1.5 text-muted-foreground"><Users className="h-4 w-4" />{activeStudents.length}</span>
                  <span className="flex items-center gap-1.5 text-primary"><CheckCircle2 className="h-4 w-4" />{activeStudents.filter((student) => student.status === 'completed').length}</span>
                  {archiveId && event.status === 'archived' && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setDeleteOpen(true)} className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                      حذف الأرشيف
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {event.status === 'archived' && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                {[
                  { label: 'إجمالي الطلاب', value: narrationSummary.total, className: 'text-primary' },
                  { label: 'أكمل', value: narrationSummary.completed, className: 'text-emerald-500' },
                  { label: 'لم يكمل', value: narrationSummary.inProgress, className: 'text-amber-500' },
                  { label: 'لم يبدأ', value: narrationSummary.pending, className: 'text-muted-foreground' },
                  { label: 'غائب', value: narrationSummary.absent, className: 'text-red-500' },
                  { label: 'مستأذن', value: narrationSummary.excused, className: 'text-sky-500' },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-primary/15 bg-background/70 p-3 text-center">
                    <div className="text-xs font-black text-muted-foreground">{item.label}</div>
                    <div className={`mt-1 text-2xl font-black ${item.className}`}>{item.value}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {activeStudents.length ? activeStudents.map((student) => (
                <NarrationStudentPanel
                  key={student.id}
                  eventId={event.id}
                  student={student}
                  archived={event.status === 'archived'}
                  onSavePart={savePart}
                  onStart={startStudent}
                />
              )) : (
                <div className="rounded-lg border border-dashed border-primary/20 p-8 text-center font-bold text-muted-foreground">لا يوجد طلاب مطابقون.</div>
              )}
            </div>
          </>
        )}
        </CardContent>

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto bg-card" dir="rtl">
          <DialogHeader><DialogTitle>أرشيف أيام السرد</DialogTitle></DialogHeader>
          <div className="grid gap-2">
            {archivedEvents.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectArchive(String(item.id))}
                className="rounded-xl border border-primary/15 bg-background/60 p-4 text-right transition hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="font-black text-foreground">{item.name}</div>
                <div className="mt-1 text-xs font-bold text-muted-foreground">{item.startDate} إلى {item.endDate} · {item.studentsCount} طالب</div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-card" dir="rtl">
          <DialogHeader><DialogTitle>فتح يوم سرد</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-1"><Label>اسم يوم السرد</Label><Input aria-label="اسم يوم السرد" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="min-w-0 space-y-1"><Label>البداية</Label><DashboardDatePicker value={form.startDate} max={form.endDate} onChange={(startDate) => setForm({ ...form, startDate })} ariaLabel="بداية يوم السرد" /></div>
              <div className="min-w-0 space-y-1"><Label>النهاية</Label><DashboardDatePicker value={form.endDate} min={form.startDate} onChange={(endDate) => setForm({ ...form, endDate })} ariaLabel="نهاية يوم السرد" /></div>
            </div>
            <div className="space-y-2"><Label>الحلقات</Label><CommitteeMultiSelect committees={committees} value={form.committeeIds} onChange={(committeeIds) => setForm({ ...form, committeeIds })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button><Button onClick={createEvent} disabled={isSaving || !form.name || !form.committeeIds.length}>فتح</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={endOpen} onOpenChange={setEndOpen}>
        <DialogContent className="bg-card" dir="rtl">
          <DialogHeader><DialogTitle>إنهاء يوم السرد</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>حدد الحلقات المراد إنهاء السرد عليها</Label>
            <Select value={endScope} onValueChange={setEndScope}>
              <SelectTrigger aria-label="الحلقات المراد إنهاء السرد عليها" className={controlClassName}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الحلقات</SelectItem>
                {eventCommittees.map((committee) => <SelectItem key={committee.id} value={committee.id}>{committee.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3">
              <p className="text-sm font-black text-foreground">
                سيتم إنهاء السرد وحفظ حالة كل طالب كما هي، حتى لو لم يكتمل تقييم الجميع.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-black sm:grid-cols-5">
                <span>أكمل: {endSummary.completed}</span>
                <span>لم يكمل: {endSummary.inProgress}</span>
                <span>لم يبدأ: {endSummary.pending}</span>
                <span>غائب: {endSummary.absent}</span>
                <span>مستأذن: {endSummary.excused}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEndOpen(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={endNarration} disabled={isEnding}>إنهاء يوم السرد</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="bg-card" dir="rtl">
          <DialogHeader><DialogTitle>حذف الأرشيف</DialogTitle></DialogHeader>
          <p className="py-2 font-bold text-muted-foreground">هل تريد حذف أرشيف {event?.name} نهائيًا؟</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={deleteArchive} disabled={isDeleting}>حذف الأرشيف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </Card>
    </>
  );
};

export default NarrationDaySection;
