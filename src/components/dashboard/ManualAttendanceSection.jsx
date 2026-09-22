import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import { studentsApi } from '@/services/studentsApi';
import { getBusinessDate } from '../../../shared/business-date.js';

const toDateOnly = getBusinessDate;

const today = () => toDateOnly(new Date());

const defaultSessionDays = [0, 3];

const isDateOnly = (value) => {
  const date = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
};

const normalizeSessionDays = (days) => {
  const normalized = [...new Set((Array.isArray(days) ? days : defaultSessionDays).map(Number))]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  return normalized.length ? normalized : defaultSessionDays;
};

const addUtcDays = (dateValue, days) => {
  const parsed = new Date(`${dateValue}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
};

const getSessionDate = (dateValue = today(), sessionDays = defaultSessionDays) => {
  const baseDate = isDateOnly(dateValue) ? String(dateValue) : today();
  const days = normalizeSessionDays(sessionDays);
  let offset = 0;
  while (!days.includes(new Date(`${addUtcDays(baseDate, -offset)}T00:00:00Z`).getUTCDay()) && offset <= 7) {
    offset += 1;
  }
  return addUtcDays(baseDate, -offset);
};

const sessionDayLabel = (dateValue) => {
  return new Date(`${dateValue}T00:00:00Z`).toLocaleDateString('ar-SA', {
    weekday: 'long',
    timeZone: 'Asia/Riyadh',
  });
};

const attendanceStatuses = [
  { key: 'present', label: 'حاضر' },
  { key: 'late', label: 'متأخر' },
  { key: 'absent', label: 'غائب' },
  { key: 'excused', label: 'مستأذن' },
];

const statusLabel = (status) => {
  if (status === 'no_session') return 'لا توجد جلسة في هذا اليوم';
  if (status === 'present') return 'حاضر';
  if (status === 'late') return 'متأخر';
  if (status === 'absent') return 'غائب';
  if (status === 'excused') return 'مستأذن';
  return 'اختر الحالة';
};

const ManualAttendanceSection = ({ teacherScoped = false }) => {
  const { toast } = useToast();
  const [target, setTarget] = useState('students');
  const [attendanceDate] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const date = params.get('date') || today();
    return isDateOnly(date) ? String(date) : today();
  });
  const [sessionDays, setSessionDays] = useState(defaultSessionDays);
  const [committeeId, setCommitteeId] = useState('all');
  const [committees, setCommittees] = useState([]);
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState([]);
  const sessionDate = useMemo(() => getSessionDate(attendanceDate, sessionDays), [attendanceDate, sessionDays]);
  const effectiveDate = target === 'students' ? sessionDate : attendanceDate;
  const headerDate = effectiveDate;
  const headerLabel = target === 'students' ? `جلسة ${sessionDayLabel(sessionDate)}` : sessionDayLabel(attendanceDate);

  const groupedRows = useMemo(() => {
    return [{ title: target, rows }];
  }, [rows, target]);

  const updateRowStatus = (id, status, points = 0) => {
    setRows((current) => current.map((item) => (
      Number(item.id) === Number(id)
        ? { ...item, status, points, recordDate: effectiveDate }
        : item
    )));
  };

  const loadRows = useCallback(async () => {
    setIsLoading(true);
    try {
      if (target === 'students') {
        setRows(await studentsApi.getStudentReport({ date: effectiveDate, committeeId }));
      } else {
        setRows(await studentsApi.getSupervisorReport({ date: effectiveDate }));
      }
    } finally {
      setIsLoading(false);
    }
  }, [committeeId, effectiveDate, target]);

  useEffect(() => {
    if (!teacherScoped) {
      studentsApi.getCommittees().then(setCommittees).catch((error) => {
        toast({ title: 'تعذر تحميل الحلقات', description: error.message, variant: 'destructive' });
      });
    }
    studentsApi.getPublicSettings().then((settings) => {
      setSessionDays(normalizeSessionDays(settings?.recitationSessionDays));
    }).catch(() => {
      setSessionDays(defaultSessionDays);
    });
  }, [teacherScoped, toast]);

  useEffect(() => {
    loadRows().catch((error) => {
      toast({ title: 'تعذر تحميل التحضير', description: error.message, variant: 'destructive' });
    });
  }, [loadRows, toast]);

  const setAttendanceStatus = async (row, status) => {
    if (pendingIds.includes(row.id) || row.status === status) return;
    setPendingIds((current) => [...current, row.id]);
    try {
      const payload = { date: effectiveDate, mode: 'manual', status };
      let result;
      if (target === 'students') {
        if (status === 'absent') {
          result = await studentsApi.markStudentAbsent(row.id, payload);
        } else {
          result = await studentsApi.checkInStudent(row.id, payload);
        }
      } else {
        if (status === 'absent') {
          result = await studentsApi.markSupervisorAbsent(row.id, payload);
        } else {
          result = await studentsApi.checkInSupervisor(row.id, payload);
        }
      }

      updateRowStatus(row.id, result.status || status, Number(result.points || 0));
      toast({
        title: 'تم تحديث التحضير',
        description: `${row.name}: ${statusLabel(result.status || status)}`,
      });
    } catch (error) {
      toast({ title: 'تعذر تحديث التحضير', description: error.message, variant: 'destructive' });
    } finally {
      setPendingIds((current) => current.filter((id) => Number(id) !== Number(row.id)));
    }
  };

  const _resolveManualAttendanceSection = () => {
    if (isLoading) {
      return <DashboardLoader />;
    }
    if (rows.length === 0) {
      return <div className="rounded-xl border border-dashed border-primary/20 py-12 text-center text-muted-foreground">
              لا توجد بيانات للتحضير.
            </div>;
    }
    return <div className="space-y-2">
              {groupedRows.map((group) => (
                <section key={group.title}>
                  <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] lg:grid-cols-[repeat(auto-fill,minmax(9.5rem,11rem))]" dir="rtl">
                    {group.rows.map((row) => (
                      <article key={row.id} className="grid content-start gap-1.5 rounded-lg border border-primary/20 bg-background p-2.5 shadow-sm shadow-primary/5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-foreground">{row.name}</p>
                          {target === 'supervisors' && (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.jobTitle || 'معلم'}</p>
                          )}
                        </div>
                        {row.status === 'no_session' ? (
                          <div className="flex min-h-10 items-center rounded-lg border border-primary/15 bg-muted/30 px-3 text-sm font-bold text-muted-foreground">
                            {statusLabel(row.status)}
                          </div>
                        ) : (
                          <Select
                            value={row.status || ''}
                            onValueChange={(value) => setAttendanceStatus(row, value)}
                            disabled={pendingIds.includes(row.id)}
                          >
                            <SelectTrigger aria-label={`حالة حضور ${row.name}`} className="h-11 w-[7.25rem] max-w-full justify-self-start bg-card px-3 pl-8 text-foreground">
                              <SelectValue placeholder="اختر الحالة" />
                            </SelectTrigger>
                            <SelectContent>
                              {attendanceStatuses.map(({ key, label }) => (
                                <SelectItem key={key} value={key}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>;
  };
  return (
    <div className="space-y-5">
      <Card className="border-primary/30 bg-card neon-glow">
        <CardHeader className="border-b border-primary/20 px-3 sm:px-6">
          {teacherScoped ? (
            <div className="flex w-full justify-start">
              <div className="flex min-h-11 min-w-44 flex-col justify-center rounded-xl border border-primary/20 bg-background/70 px-3 text-right">
                <span className="text-xs font-bold text-primary">{headerDate}</span>
                <span className="text-sm font-black text-foreground">{headerLabel}</span>
              </div>
            </div>
          ) : (
            <div className="grid w-full grid-cols-2 gap-2 md:grid-cols-[minmax(0,220px)_minmax(0,220px)_auto] md:items-center">
              <div className="min-w-0">
                <Label className="sr-only">الفئة</Label>
                <Select value={target} onValueChange={setTarget}>
                  <SelectTrigger aria-label="الفئة" className="h-11 w-full bg-background border-primary/30 text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="students">طلاب</SelectItem>
                    <SelectItem value="supervisors">المعلمين والمقرئين والإدارة</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {target === 'students' ? (
                <div className="min-w-0">
                  <Label className="sr-only">الحلقة</Label>
                  <Select value={committeeId} onValueChange={setCommitteeId}>
                    <SelectTrigger aria-label="الحلقة" className="h-11 w-full bg-background border-primary/30 text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع الحلقات</SelectItem>
                      {committees.map((committee) => (
                        <SelectItem key={committee.id} value={String(committee.id)}>
                          {committee.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="hidden md:block" />
              )}

              <div className="col-span-2 flex min-h-11 flex-col justify-center rounded-xl border border-primary/15 bg-background/70 px-3 text-right md:col-span-1 md:justify-self-end">
                <span className="text-xs font-bold text-primary">{headerDate}</span>
                <span className="text-sm font-black text-foreground">{headerLabel}</span>
              </div>
            </div>
          )}
        </CardHeader>

        <CardContent className="px-3 pt-3 sm:px-4 lg:px-4">
          {_resolveManualAttendanceSection()}
        </CardContent>
      </Card>
    </div>
  );
};

export default ManualAttendanceSection;
