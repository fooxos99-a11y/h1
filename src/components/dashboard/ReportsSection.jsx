import DashboardDateRange from '@/components/dashboard/DashboardDateRange';
import DashboardHeaderFilters from '@/components/dashboard/DashboardHeaderFilters';
import { formatClockTime } from '../../../shared/clock-time.js';
import NazemReconciliationReport from './NazemReconciliationReport';
import ErrorState from '@/components/ui/error-state';
import StudentPointsReport from '@/components/dashboard/StudentPointsReport';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, FileDown, FileSpreadsheet, FileText, Send } from 'lucide-react';
import { DashboardDatePicker, DashboardSecondaryButton } from '@/components/dashboard/DashboardControls';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import DashboardMobileHeaderActions from '@/components/dashboard/DashboardMobileHeaderActions';
import ExecutionFollowupSection from '@/components/dashboard/ExecutionFollowupSection';
import ReportsOverview from '@/components/dashboard/ReportsOverview';
import ReportsProgress from '@/components/dashboard/ReportsProgress';
import ReportsRecitationSessions from '@/components/dashboard/ReportsRecitationSessions';
import ReportsStudentSaved from '@/components/dashboard/ReportsStudentSaved';
import TeacherPointsReport from '@/components/dashboard/TeacherPointsReport';
import { getRecitationStatusLabel, isMasteredRecitation } from '@/lib/recitationEvaluation';
import { studentsApi } from '@/services/studentsApi';
import useOnlineStatus from '@/hooks/useOnlineStatus';
import { loadOfflineSnapshot } from '@/services/offlineOperationsService';
import { getBusinessDate } from '../../../shared/business-date.js';

const today = getBusinessDate;

const statusLabel = (status) => {
  if (status === 'no_session') return 'لا توجد جلسة في هذا اليوم';
  if (status === 'present') return 'حاضر';
  if (status === 'late') return 'متأخر';
  if (status === 'excused') return 'مستأذن';
  return 'غائب';
};

const statusClassName = (status) => {
  if (status === 'no_session') return 'text-muted-foreground';
  if (status === 'present') return 'text-green-400';
  if (status === 'late') return 'text-amber-400';
  if (status === 'excused') return 'text-sky-400';
  return 'text-red-400';
};

const reportControlClassName = 'h-11 w-full max-w-full min-w-0 rounded-xl border-primary/30 bg-background px-3 text-sm font-semibold text-foreground shadow-none xl:h-10';
const whatsappReportLabels = {
  students: 'متابعة الطلاب',
  supervisors: 'تقرير تحضير المعلمين والمقرئين والإدارة',
  recitationSessions: 'تقرير جلسات التسميع',
  studentSaved: 'تقرير محفوظ الطلاب',
  overview: 'تقرير الإحصائيات',
  archive: 'أرشيف التقارير',
};

const ReportsSection = ({
  teacherScoped = false,
  canViewStandardReports = true,
  canViewExecutionFollowup = false,
  canViewTeacherPoints = false,
}) => {
  const isOnline = useOnlineStatus();
  const accountId = Number(localStorage.getItem('wajeh_account_id') || localStorage.getItem('wajeh_supervisor_id') || 0);
  const actorRole = localStorage.getItem('wajeh_role') || 'manager';
  const { toast } = useToast();
  const [target, setTarget] = useState(
    canViewStandardReports ? 'overview' : 'executionFollowup'
  );
  const [date, setDate] = useState(today());
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState(today());
  const [committeeId, setCommitteeId] = useState('all');
  const studentId = 'all';
  const [recitationStatus, setRecitationStatus] = useState('all');
  const [committees, setCommittees] = useState([]);
  const [rows, setRows] = useState([]);
  const [studentPointRows, setStudentPointRows] = useState([]);
  const [studentPointsError, setStudentPointsError] = useState('');
  const [reportRetry, setReportRetry] = useState(0);
  const [reportPeriod, setReportPeriod] = useState(null);
  const [overview, setOverview] = useState(null);
  const [archives, setArchives] = useState([]);
  const [archiveId, setArchiveId] = useState('');
  const [archive, setArchive] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeletingArchive, setIsDeletingArchive] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [supervisors, setSupervisors] = useState([]);
  const [selectedSupervisorIds, setSelectedSupervisorIds] = useState([]);
  const [selectedReportFormats, setSelectedReportFormats] = useState(['pdf']);
  const [isExporting, setIsExporting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const progressFromDate = fromDate || date;
  const reportFromDate = progressFromDate;
  const reportToDate = toDate;
  const cachedReport = useCallback((key, loader) => loadOfflineSnapshot(
    accountId,
    `reports:${key}`,
    loader,
    { actorRole },
  ), [accountId, actorRole]);

  useEffect(() => {
    Promise.all([
      canViewStandardReports ? cachedReport('scoped-committees', () => studentsApi.getReportCommittees()) : Promise.resolve([]),
      teacherScoped ? Promise.resolve([]) : cachedReport('archives', () => studentsApi.getReportArchives()).catch(() => []),
    ]).then(([committeeRows, archiveRows]) => {
      setCommittees(committeeRows);
      setArchives(archiveRows);
    }).catch((error) => {
      toast({ title: 'تعذر تحميل البيانات', description: error.message, variant: 'destructive' });
    });
  }, [cachedReport, canViewStandardReports, teacherScoped, toast]);

  useEffect(() => {
    if (!isOnline && target === 'executionFollowup' && canViewStandardReports) setTarget('students');
  }, [canViewStandardReports, isOnline, target]);

  useEffect(() => {
    if (!teacherScoped) return;
    const allowedTargets = [
      ...(canViewExecutionFollowup ? ['executionFollowup'] : []),
      ...(canViewStandardReports ? ['students', 'studentSaved', 'studentPoints', 'nazemReconciliation', 'overview'] : []),
      ...(canViewTeacherPoints ? ['teacherPoints'] : []),
    ];
    if (!allowedTargets.includes(target) && allowedTargets[0]) setTarget(allowedTargets[0]);
  }, [canViewExecutionFollowup, canViewStandardReports, canViewTeacherPoints, target, teacherScoped]);

  useEffect(() => {
    if (target === 'teacherPoints' && !canViewTeacherPoints) {
      setTarget(canViewStandardReports ? 'students' : 'executionFollowup');
    } else if (target === 'executionFollowup' && !canViewExecutionFollowup) {
      setTarget(canViewStandardReports ? 'students' : 'executionFollowup');
    } else if (target !== 'executionFollowup' && !canViewStandardReports && canViewExecutionFollowup) {
      setTarget('executionFollowup');
    }
  }, [canViewExecutionFollowup, canViewStandardReports, canViewTeacherPoints, target]);

  useEffect(() => {
    let active = true;
    const loadReport = async () => {
      setIsLoading(true);
      try {
        if (target === 'executionFollowup' || target === 'nazemReconciliation') {
          setArchive(null);
          setOverview(null);
          setRows([]);
          setReportPeriod(null);
        } else if (target === 'archive') {
          setOverview(null);
          setRows([]);
          setReportPeriod(null);
          if (!archiveId) {
            setArchive(null);
            return;
          }
          const report = await cachedReport(`archive:${archiveId}`, () => studentsApi.getReportArchive(archiveId));
          if (!active) return;
          setArchive(report);
        } else if (target === 'overview') {
          setArchive(null);
          setReportPeriod(null);
          const report = await cachedReport(`overview:${fromDate}:${toDate}:${committeeId}`, () => studentsApi.getOverviewReport({ ...(fromDate ? { from: fromDate, to: toDate } : {}), committeeId }));
          if (!active) return;
          setOverview(report);
          if (!fromDate && report?.period?.from) setFromDate(report.period.from);
          if (report?.period?.to && report.period.to !== toDate) setToDate(report.period.to);
          setRows([]);
        } else if (target === 'students') {
          setArchive(null);
          setOverview(null);
          const report = await cachedReport(`students:${reportFromDate}:${reportToDate}:${committeeId}:${studentId}`, () => studentsApi.getProgressReport({
            from: reportFromDate,
            to: reportToDate,
            committeeId,
            studentId,
          }));
          if (!active) return;
          setRows(report.rows || []);
          setReportPeriod(report.period || null);
        } else if (target === 'studentPoints') {
          setArchive(null);
          setOverview(null);
          setStudentPointRows([]);
          setStudentPointsError('');
          const report = await cachedReport(`student-points:${reportFromDate}:${reportToDate}:${committeeId}`, () => studentsApi.getStudentPointTransactionsReport({
            from: reportFromDate, to: reportToDate, committeeId,
          }));
          if (!active) return;
          setStudentPointRows(report.rows || []);
          setReportPeriod(report.period || null);
        } else if (target === 'teacherPoints') {
          setArchive(null);
          setOverview(null);
          const report = await cachedReport(`teacher-points:${reportFromDate}:${reportToDate}`, () => studentsApi.getTeacherPointsReport({ from: reportFromDate, to: reportToDate }));
          if (!active) return;
          setRows(report.rows || []);
          setReportPeriod(report.period || null);
        } else if (target === 'recitationSessions') {
          setArchive(null);
          setOverview(null);
          setReportPeriod(null);
          const report = await cachedReport(`recitation:${fromDate}:${toDate}:${committeeId}`, () => studentsApi.getRecitationSessionsReport({ from: fromDate, to: toDate, committeeId }));
          if (!active) return;
          setRows(report.rows || []);
          if (!fromDate && report?.period?.from) setFromDate(report.period.from);
        } else if (target === 'studentSaved') {
          setArchive(null);
          setOverview(null);
          const report = await cachedReport(`student-saved:all:${committeeId}:${studentId}`, () => studentsApi.getStudentSavedReport({
            committeeId,
            studentId,
          }));
          if (!active) return;
          setRows(report.rows || []);
          setReportPeriod(report.period || null);
        } else if (target === 'supervisors') {
          setArchive(null);
          setOverview(null);
          setReportPeriod(null);
          const report = await cachedReport(`supervisors:${date}`, () => studentsApi.getSupervisorReport({ date }));
          if (!active) return;
          setRows(report);
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };

    loadReport().catch((error) => {
      if (!active) return;
      if (target === 'studentPoints') setStudentPointsError(error.message || 'تعذر تحميل نقاط الطلاب.');
      toast({ title: 'تعذر تحميل التقرير', description: error.message, variant: 'destructive' });
    });
    return () => { active = false; };
  }, [reportRetry, target, date, reportFromDate, reportToDate, fromDate, toDate, committeeId, studentId, archiveId, teacherScoped, toast, cachedReport]);

  const isOverviewReport = target === 'overview';
  const isStudentsReport = target === 'students';
  const isRecitationSessionsReport = target === 'recitationSessions';
  const isStudentSavedReport = target === 'studentSaved';
  const isSupervisorsReport = target === 'supervisors';
  const isArchiveReport = target === 'archive';
  const isExecutionFollowup = target === 'executionFollowup';
  const isNazemReconciliationReport = target === 'nazemReconciliation';
  const isStudentPointsReport = target === 'studentPoints';
  const isTeacherPointsReport = target === 'teacherPoints';
  const isRangeReport = isOverviewReport || isStudentsReport || isRecitationSessionsReport || isTeacherPointsReport || isStudentPointsReport || isNazemReconciliationReport;
  const visibleRecitationRows = useMemo(() => {
    if (recitationStatus === 'mastered') return rows.filter(isMasteredRecitation);
    if (recitationStatus === 'repeat') return rows.filter((row) => getRecitationStatusLabel(row) === 'يحتاج إعادة');
    if (recitationStatus === 'incomplete') return rows.filter((row) => getRecitationStatusLabel(row) === 'لم يُستكمل');
    return rows;
  }, [recitationStatus, rows]);
  const controlGridClass = 'grid-cols-2';

  const archiveRows = (archive?.progressReport?.rows || []).filter((row) => {
    if (committeeId === 'all') return true;
    const committee = committees.find((item) => String(item.id) === String(committeeId));
    return committee ? row.committeeName === committee.name : true;
  });

  const deleteArchive = async () => {
    if (!archiveId) return;
    setIsDeletingArchive(true);
    try {
      await studentsApi.deleteReportArchive(archiveId);
      const nextArchives = await studentsApi.getReportArchives();
      setArchives(nextArchives);
      setArchiveId('');
      setArchive(null);
      toast({ title: 'تم حذف الأرشيف' });
    } catch (error) {
      toast({ title: 'تعذر حذف الأرشيف', description: error.message, variant: 'destructive' });
    } finally {
      setIsDeletingArchive(false);
    }
  };

  const updateFromDate = (value) => {
    setFromDate(value);
    if (value > toDate) setToDate(value);
  };

  const updateToDate = (value) => {
    setToDate(value);
    const start = (isStudentsReport || isStudentPointsReport || isNazemReconciliationReport) ? progressFromDate : fromDate;
    if (value < start) setFromDate(value);
  };

  const downloadFile = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const exportReport = async (format) => {
    setExportOpen(false);
    setIsExporting(true);
    try {
      const exportPayload = {
        from: isRecitationSessionsReport ? fromDate : reportFromDate,
        to: isStudentsReport ? reportToDate : toDate,
        date,
        committeeId,
        studentId,
        archiveId,
        format,
      };
      let file;
      if (isOverviewReport) {
        file = await studentsApi.exportOverviewReport(exportPayload);
      } else {
        if (isSupervisorsReport) {
          file = await studentsApi.exportSupervisorReport(exportPayload);
        } else {
          if (isArchiveReport) {
            file = await studentsApi.exportArchiveReport(exportPayload);
          } else {
            if (isRecitationSessionsReport) {
              file = await studentsApi.exportRecitationSessionsReport(exportPayload);
            } else {
              if (isStudentSavedReport) {
                file = await studentsApi.exportStudentSavedReport(exportPayload);
              } else {
                file = await studentsApi.exportProgressReport(exportPayload);
              }
            }
          }
        }
      }
      downloadFile(file.blob, file.filename);
      toast({ title: 'تم التصدير', description: format === 'xlsx' ? 'تم تجهيز ملف Excel.' : 'تم تجهيز ملف PDF.' });
    } catch (error) {
      toast({ title: 'تعذر التصدير', description: error.message, variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const openSendDialog = async () => {
    setExportOpen(false);
    setSendDialogOpen(true);
    setSelectedReportFormats(['pdf']);
    try {
      const rows = await studentsApi.getReportWhatsAppRecipients();
      setSupervisors(rows);
      setSelectedSupervisorIds([]);
    } catch (error) {
      toast({ title: 'تعذر تحميل المعلمين والمقرئين والإدارة', description: error.message, variant: 'destructive' });
    }
  };

  const toggleSupervisor = (id) => {
    const value = String(id);
    setSelectedSupervisorIds((current) => (
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    ));
  };

  const availableSupervisorIds = supervisors
    .filter((supervisor) => String(supervisor.phone || '').trim())
    .map((supervisor) => String(supervisor.id));
  const allAvailableSelected = availableSupervisorIds.length > 0
    && availableSupervisorIds.every((id) => selectedSupervisorIds.includes(id));

  const toggleAllSupervisors = () => {
    setSelectedSupervisorIds(allAvailableSelected ? [] : availableSupervisorIds);
  };

  const toggleReportFormat = (format) => {
    setSelectedReportFormats((current) => (
      current.includes(format) ? current.filter((item) => item !== format) : [...current, format]
    ));
  };

  const sendReport = async () => {
    setIsSending(true);
    try {
      const result = await studentsApi.sendReportWhatsApp({
        reportType: target === 'students' ? 'progress' : target,
        from: target === 'students' ? progressFromDate : fromDate,
        to: toDate,
        date,
        committeeId,
        studentId,
        archiveId,
        formats: selectedReportFormats,
        supervisorIds: selectedSupervisorIds,
      });
      toast({
        title: 'تم الإرسال',
        description: `تم إرسال ${result.sentCount || 0} تقرير${result.failedCount ? `، وتعذر ${result.failedCount}` : ''}.`,
      });
      setSendDialogOpen(false);
      setSelectedSupervisorIds([]);
    } catch (error) {
      toast({ title: 'تعذر الإرسال', description: error.message, variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  const renderExportMenu = (compact = false) => (isOverviewReport || isStudentsReport || isRecitationSessionsReport || isStudentSavedReport || isSupervisorsReport || isArchiveReport) ? (
    <div className={compact ? 'relative w-11 min-w-0 flex-none' : 'relative w-[112px] min-w-0 flex-none'}>
      <DashboardSecondaryButton
        onClick={() => setExportOpen((current) => !current)}
        disabled={!isOnline || isExporting || (isArchiveReport && !archiveId)}
        className={compact ? 'h-11 w-11 gap-0 px-0' : 'w-full gap-2 px-3 text-sm xl:h-10'}
        title="تصدير التقرير"
        aria-label="تصدير التقرير"
      >
        <FileDown className="h-4 w-4" />
        {!compact && <span>تصدير</span>}
        {!compact && <ChevronDown className={`h-4 w-4 transition ${exportOpen ? 'rotate-180' : ''}`} />}
      </DashboardSecondaryButton>
      {exportOpen && (
        <div className="absolute left-0 top-12 z-[120] w-56 overflow-hidden rounded-xl border border-primary/20 bg-popover p-1 text-popover-foreground shadow-2xl shadow-primary/10" dir="rtl">
          <button type="button" onClick={() => exportReport('pdf')} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-sm font-bold hover:bg-primary/10">
            <FileText className="h-4 w-4 text-primary" />
            PDF
          </button>
          <button type="button" onClick={() => exportReport('xlsx')} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-sm font-bold hover:bg-primary/10">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Excel
          </button>
          {!teacherScoped && (
            <button type="button" onClick={openSendDialog} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-sm font-bold hover:bg-primary/10">
              <Send className="h-4 w-4 text-primary" />
              إرسال عبر الواتس
            </button>
          )}
        </div>
      )}
    </div>
  ) : null;

  const _resolveReportsSection = () => {
    if (isExecutionFollowup) {
      return <ExecutionFollowupSection teacherScoped={teacherScoped} />;
    }
    if (isOverviewReport) {
      if (isLoading) {
        return <DashboardLoader className="p-8" />;
      }
      return <ReportsOverview data={overview} />;
    }
    if (isArchiveReport) {
      if (isLoading) {
        return <DashboardLoader className="p-8" />;
      }
      if (archive) {
        return <div className="space-y-6">
                <div className="flex flex-col gap-3 rounded-lg border border-primary/15 bg-background/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm font-black text-muted-foreground">{archive.title} - من {archive.periodFrom} إلى {archive.periodTo}</div>
                  <Button type="button" variant="outline" disabled={!isOnline || isDeletingArchive} onClick={deleteArchive} className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive">
                    حذف الأرشيف
                  </Button>
                </div>
                <ReportsOverview data={archive.overviewReport} />
                <ReportsProgress rows={archiveRows} period={archive.progressReport?.period} />
              </div>;
      }
      return <div className="rounded-lg border border-dashed border-primary/20 p-8 text-center text-muted-foreground">
                {archives.length ? 'اختر أرشيفًا لعرضه.' : 'لا توجد أرشيفات حاليًا.'}
              </div>;
    }
    if (isRecitationSessionsReport) {
      if (isLoading) {
        return <DashboardLoader className="p-8" />;
      }
      return <ReportsRecitationSessions rows={visibleRecitationRows} />;
    }
    if (isStudentSavedReport) {
      if (isLoading) {
        return <DashboardLoader className="p-8" />;
      }
      return <ReportsStudentSaved rows={rows} />;
    }
    if (isStudentsReport) {
      if (isLoading) {
        return <DashboardLoader className="p-8" />;
      }
      return <ReportsProgress rows={rows} period={reportPeriod} />;
    }
    if (isNazemReconciliationReport) {
      return <NazemReconciliationReport from={reportFromDate} to={reportToDate} committeeId={committeeId} />;
    }
    if (isStudentPointsReport) {
      if (isLoading) {
        return <DashboardLoader className="p-8" />;
      }
      if (studentPointsError) {
        return <ErrorState message={studentPointsError} onRetry={() => setReportRetry((value) => value + 1)} />;
      }
      return <StudentPointsReport rows={studentPointRows} />;
    }
    if (isTeacherPointsReport) {
      if (isLoading) {
        return <DashboardLoader className="p-8" />;
      }
      return <TeacherPointsReport rows={rows} showTeacher={!teacherScoped} />;
    }
    const _resolve_resolveReportsSection = () => {
      if (isLoading) {
        return <DashboardLoader className="p-8" />;
      }
      if (rows.length === 0) {
        return <div className="p-8 text-center text-muted-foreground">لا توجد بيانات لهذا التاريخ.</div>;
      }
      return rows.map((row) => (
                  <div key={row.id} className="grid grid-cols-[1.4fr_1fr_1fr] border-t border-primary/10 p-3 text-sm md:grid-cols-[1.5fr_1fr_1fr_1fr]">
                    <span className="font-medium text-foreground">{row.name}</span>
                    <span className="text-muted-foreground">{row.jobTitle}</span>
                    <span className={statusClassName(row.status)}>{statusLabel(row.status)}</span>
                    <span className="hidden items-center gap-2 text-muted-foreground md:flex">
                      <CalendarDays className="h-4 w-4" />
                      {formatClockTime(row.checkInTime)}
                    </span>
                  </div>
                ));
    };
    return <div className="overflow-hidden rounded-2xl border border-primary/20">
              <div className="grid grid-cols-[1.4fr_1fr_1fr] bg-background/80 p-3 text-sm font-bold text-muted-foreground md:grid-cols-[1.5fr_1fr_1fr_1fr]">
                <span>الاسم</span>
                <span>المسمى</span>
                <span>الحالة</span>
                <span className="hidden md:block">الوقت</span>
              </div>

              {_resolve_resolveReportsSection()}
            </div>;
  };
  return (
    <div className="space-y-6">
      {!isOnline && !isNazemReconciliationReport && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-700 dark:text-amber-200">
          تعرض التقارير المحفوظة فقط دون إنترنت. التصدير والإرسال والحذف متاحة بعد عودة الاتصال.
        </div>
      )}
      {!isExecutionFollowup && !isStudentSavedReport && !isArchiveReport && (teacherScoped || isRangeReport) && <DashboardHeaderFilters>
        <DashboardDateRange from={teacherScoped || isStudentsReport || isStudentPointsReport || isNazemReconciliationReport ? progressFromDate : fromDate} to={toDate} onFromChange={updateFromDate} onToChange={updateToDate} />
      </DashboardHeaderFilters>}
      <DashboardMobileHeaderActions>
        <div className="lg:hidden">{renderExportMenu(true)}</div>
        <div className="hidden lg:block">{renderExportMenu()}</div>
      </DashboardMobileHeaderActions>
      <Card className="bg-card border-primary/30 neon-glow">
        <CardHeader className="border-b border-primary/20 p-3 sm:p-6">
          <div className={`grid w-full min-w-0 gap-3 ${controlGridClass}`}>
            {(canViewStandardReports || canViewExecutionFollowup || canViewTeacherPoints) && (
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger aria-label="نوع التقرير" className={reportControlClassName}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {teacherScoped ? (
                    <>
                      {canViewExecutionFollowup && <SelectItem value="executionFollowup">متابعة تنفيذ</SelectItem>}
                      {canViewStandardReports && <SelectItem value="students">طلاب</SelectItem>}
                      {canViewStandardReports && <SelectItem value="studentSaved">محفوظ الطلاب</SelectItem>}
                      {canViewStandardReports && <SelectItem value="studentPoints">نقاط الطلاب</SelectItem>}
                      {canViewStandardReports && <SelectItem value="nazemReconciliation">مطابقة ناظم</SelectItem>}
                      {canViewStandardReports && <SelectItem value="overview">إحصائيات</SelectItem>}
                      {canViewTeacherPoints && <SelectItem value="teacherPoints">عمليات الإضافة والخصم</SelectItem>}
                    </>
                  ) : (
                    <>
                      {canViewStandardReports && <SelectItem value="students">متابعة الطلاب</SelectItem>}
                      {canViewExecutionFollowup && <SelectItem value="executionFollowup">متابعة التنفيذ</SelectItem>}
                      {canViewStandardReports && <SelectItem value="recitationSessions">جلسات التسميع</SelectItem>}
                      {canViewStandardReports && <SelectItem value="studentSaved">محفوظ الطلاب</SelectItem>}
                      {canViewStandardReports && <SelectItem value="studentPoints">نقاط الطلاب</SelectItem>}
                      {canViewStandardReports && <SelectItem value="nazemReconciliation">مطابقة ناظم</SelectItem>}
                      {canViewStandardReports && <SelectItem value="supervisors">المعلمين والمقرئين والإدارة</SelectItem>}
                      {canViewStandardReports && <SelectItem value="overview">الإحصائيات</SelectItem>}
                      {canViewTeacherPoints && <SelectItem value="teacherPoints">عمليات الإضافة والخصم</SelectItem>}
                      {canViewStandardReports && <SelectItem value="archive">الأرشيف</SelectItem>}
                    </>
                  )}
                </SelectContent>
              </Select>
            )}

            {isExecutionFollowup && (
              <div
                id="execution-followup-report-controls"
                className="contents"
              />
            )}

            {!teacherScoped && !isExecutionFollowup && (isOverviewReport || isStudentPointsReport || isNazemReconciliationReport || target === 'students' || target === 'recitationSessions' || target === 'studentSaved' || target === 'archive') && (
              <Select value={committeeId} onValueChange={setCommitteeId}>
                <SelectTrigger aria-label="الحلقة" className={reportControlClassName}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحلقات</SelectItem>
                  {committees.map((committee) => (
                    <SelectItem key={committee.id} value={String(committee.id)}>
                      {committee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {isRecitationSessionsReport && (
              <Select value={recitationStatus} onValueChange={setRecitationStatus}>
                <SelectTrigger aria-label="حالة التسميع" className={reportControlClassName}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل حالات التسميع</SelectItem>
                  <SelectItem value="mastered">متقن</SelectItem>
                  <SelectItem value="repeat">يحتاج إعادة</SelectItem>
                  <SelectItem value="incomplete">لم يُستكمل</SelectItem>
                </SelectContent>
              </Select>
            )}

            {target === 'archive' && (
              <div className="col-span-full min-w-0 sm:w-[220px] sm:max-w-full xl:contents">
                <div className="min-w-0">
                  <Select value={archiveId} onValueChange={setArchiveId}>
                    <SelectTrigger aria-label="الأرشيف" className={reportControlClassName}>
                      <SelectValue placeholder="اختر الأرشيف" />
                    </SelectTrigger>
                    <SelectContent>
                      {archives.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {!teacherScoped && !isExecutionFollowup && !isArchiveReport && !isStudentSavedReport && !isRangeReport && <DashboardDatePicker sessionDates value={date} onChange={setDate} className="w-full" />}
          </div>
        </CardHeader>

        <CardContent className="space-y-5 !pt-6">
          {_resolveReportsSection()}
        </CardContent>
      </Card>

      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="max-w-xl border-primary/30 bg-card p-0 text-foreground" dir="rtl">
          <DialogHeader className="border-b border-primary/15 px-5 py-4">
            <DialogTitle className="text-primary">إرسال التقرير عبر الواتس</DialogTitle>
            <p className="mt-1 text-sm font-bold text-muted-foreground">
              {whatsappReportLabels[target] || 'التقرير'} - اختر صيغة واحدة أو الصيغتين
            </p>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 px-5">
            {[
              { value: 'pdf', label: 'PDF', Icon: FileText },
              { value: 'xlsx', label: 'Excel', Icon: FileSpreadsheet },
            ].map(({ value, label, Icon }) => {
              const selected = selectedReportFormats.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleReportFormat(value)}
                  aria-pressed={selected}
                  className={`flex h-16 items-center justify-center gap-2 rounded-xl border text-sm font-black transition ${
                    selected
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-primary/15 bg-background/60 text-muted-foreground hover:border-primary/35'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </button>
              );
            })}
          </div>
          <div className="px-5">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/15 bg-background/70 px-3 py-2">
              <span className="text-xs font-bold text-muted-foreground">
                تم اختيار {selectedSupervisorIds.length} من {availableSupervisorIds.length}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={toggleAllSupervisors} disabled={availableSupervisorIds.length === 0}>
                {allAvailableSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
              </Button>
            </div>
          </div>
          <div className="mx-5 max-h-[52vh] divide-y divide-primary/10 overflow-y-auto rounded-xl border border-primary/15 bg-background/50">
            {supervisors.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                لا يوجد معلمون حالياً.
              </div>
            ) : supervisors.map((supervisor) => {
              const hasPhone = Boolean(String(supervisor.phone || '').trim());
              const selected = selectedSupervisorIds.includes(String(supervisor.id));
              return (
                <button
                  key={supervisor.id}
                  type="button"
                  disabled={!hasPhone}
                  onClick={() => toggleSupervisor(supervisor.id)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-right transition ${
                    selected ? 'bg-primary/10' : 'hover:bg-primary/5'
                  } ${!hasPhone ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-foreground">{supervisor.name}</span>
                    <span className="mt-0.5 block text-[11px] font-bold text-muted-foreground">
                      {hasPhone ? supervisor.phone : 'لا يوجد رقم جوال'}
                    </span>
                  </span>
                  <span className={`h-4 w-4 shrink-0 rounded border ${selected ? 'border-primary bg-primary' : 'border-primary/30 bg-background'}`} />
                </button>
              );
            })}
          </div>
          <DialogFooter className="border-t border-primary/15 px-5 py-4">
            <Button type="button" onClick={sendReport} disabled={selectedSupervisorIds.length === 0 || selectedReportFormats.length === 0 || isSending} loading={isSending}>
              إرسال
            </Button>
            <Button type="button" variant="outline" onClick={() => setSendDialogOpen(false)}>
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ReportsSection;
