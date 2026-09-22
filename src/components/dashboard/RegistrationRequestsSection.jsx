import React, { useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle2, Clipboard, Copy, X, XCircle } from 'lucide-react';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import LabeledField from '@/components/ui/labeled-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import RegistrationTemplatesDialog from '@/components/dashboard/RegistrationTemplatesDialog';
import { formatJuzNumbers } from '@/lib/juzRanges';
import { studentsApi } from '@/services/studentsApi';

const emptyAcceptForm = {
  name: '',
  loginNumber: '',
  guardianPhone: '',
  nationalId: '',
  age: '',
  committeeId: '',
};

const numberText = (value) => Number(value || 0).toLocaleString('ar-SA-u-nu-latn');
const formatSubmissionDate = (value) => {
  const datePart = String(value || '').slice(0, 10);
  const [year, month, day] = datePart.split('-').map(Number);
  if (!year || !month || !day) return '-';
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
};

const RegistrationRequestsSection = () => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [committees, setCommittees] = useState([]);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [activeRequest, setActiveRequest] = useState(null);
  const [pendingRejection, setPendingRejection] = useState(null);
  const [acceptForm, setAcceptForm] = useState(emptyAcceptForm);
  const [testResults, setTestResults] = useState({});
  const [busyKey, setBusyKey] = useState('');

  const registrationLink = useMemo(() => `${window.location.origin}/register`, []);

  const loadData = async () => {
    const [requestData, committeeData] = await Promise.all([
      studentsApi.getRegistrationRequests(),
      studentsApi.getCommittees(),
    ]);
    setRequests(requestData.requests || []);
    setRegistrationEnabled(Boolean(requestData.registrationEnabled));
    setCommittees(committeeData || []);
  };

  useEffect(() => {
    let mounted = true;
    Promise.all([
      studentsApi.getRegistrationRequests(),
      studentsApi.getCommittees(),
    ])
      .then(([requestData, committeeData]) => {
        if (!mounted) return;
        setRequests(requestData.requests || []);
        setRegistrationEnabled(Boolean(requestData.registrationEnabled));
        setCommittees(committeeData || []);
      })
      .catch((error) => {
        if (!mounted) return;
        toast({ title: 'تعذر تحميل طلبات التسجيل', description: error.message, variant: 'destructive' });
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [toast]);

  const updateConfig = async () => {
    const next = !registrationEnabled;
    setBusyKey('config');
    try {
      const result = await studentsApi.updateRegistrationConfig({ registrationEnabled: next });
      setRegistrationEnabled(Boolean(result.registrationEnabled));
      toast({ title: next ? 'تم فتح التسجيل' : 'تم إغلاق التسجيل' });
    } catch (error) {
      toast({ title: 'تعذر تعديل حالة التسجيل', description: error.message, variant: 'destructive' });
    } finally {
      setBusyKey('');
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(registrationLink);
      toast({ title: 'تم نسخ رابط التسجيل' });
    } catch {
      toast({ title: 'تعذر نسخ الرابط', description: registrationLink, variant: 'destructive' });
    }
  };

  const openAcceptDialog = (request) => {
    setActiveRequest(request);
    setAcceptForm({
      name: request.name || '',
      loginNumber: request.nationalId || '',
      guardianPhone: request.guardianPhone || '',
      nationalId: request.nationalId || '',
      age: request.age ? String(request.age) : '',
      committeeId: '',
    });
    setTestResults(request.testResults || {});
  };

  const preliminaryAccept = async (request) => {
    setBusyKey(`pre-${request.id}`);
    try {
      await studentsApi.preliminaryAcceptRegistrationRequest(request.id);
      toast({ title: 'تم إرسال القبول المبدئي' });
      await loadData();
    } catch (error) {
      const linkedDeviceOffline = error.data?.code === 'WHATSAPP_LINKED_DEVICE_OFFLINE';
      toast({
        title: linkedDeviceOffline ? 'جهاز واتساب غير متصل بالإنترنت' : 'تعذر إرسال القبول المبدئي',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setBusyKey('');
    }
  };

  const rejectRequest = async () => {
    const request = pendingRejection;
    if (!request) return;
    setBusyKey(`reject-${request.id}`);
    try {
      await studentsApi.rejectRegistrationRequest(request.id);
      toast({ title: 'تم رفض الطلب وحذفه' });
      await loadData();
    } catch (error) {
      toast({ title: 'تعذر رفض الطلب', description: error.message, variant: 'destructive' });
    } finally {
      setBusyKey('');
      setPendingRejection(null);
    }
  };

  const acceptRequest = async () => {
    if (!activeRequest) return;
    setBusyKey(`accept-${activeRequest.id}`);
    try {
      await studentsApi.acceptRegistrationRequest(activeRequest.id, {
        ...acceptForm,
        testResults,
      });
      toast({ title: 'تم قبول الطالب وإضافته' });
      setActiveRequest(null);
      await loadData();
    } catch (error) {
      toast({ title: 'تعذر قبول الطالب', description: error.message, variant: 'destructive' });
    } finally {
      setBusyKey('');
    }
  };

  const memorizationItems = activeRequest?.memorization?.items || [];
  const allResultsComplete = memorizationItems.every((item) => ['passed', 'failed'].includes(testResults[item.id]));
  const canAccept = acceptForm.name.trim()
    && acceptForm.loginNumber.trim()
    && acceptForm.committeeId
    && allResultsComplete;

  if (isLoading) {
    return <DashboardLoader className="min-h-[420px]" />;
  }

  const _resolveRegistrationRequestsSection = () => {
    if (busyKey === 'config') {
      return <LoadingSpinner />;
    }
    if (registrationEnabled) {
      return <CheckCircle2 className="h-4 w-4" />;
    }
    return <XCircle className="h-4 w-4" />;
  };
  return (
    <Card className="border-primary/30 bg-card neon-glow" dir="rtl">
      <CardHeader className="border-b border-primary/15 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-black leading-8 text-primary sm:text-2xl">طلبات التسجيل</h2>
          <div className="flex flex-wrap gap-2">
            <RegistrationTemplatesDialog />
            <Button
              type="button"
              variant="outline"
              onClick={updateConfig}
              disabled={busyKey === 'config'}
              className={`h-11 gap-2 text-white ${
                registrationEnabled
                  ? 'border-emerald-600 bg-emerald-600 hover:border-emerald-700 hover:bg-emerald-700 hover:text-white'
                  : 'border-red-600 bg-red-600 hover:border-red-700 hover:bg-red-700 hover:text-white'
              }`}
            >
              {_resolveRegistrationRequestsSection()}
              {registrationEnabled ? 'التسجيل مفتوح' : 'التسجيل مغلق'}
            </Button>
            <Button type="button" variant="outline" onClick={copyLink} className="h-11 gap-2">
              <Copy className="h-4 w-4" /> نسخ الرابط
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3 sm:p-4">
        <div className="space-y-2">
        {requests.length ? requests.map((request) => (
          <article key={request.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md dark:border-primary/15 dark:bg-card sm:p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="truncate text-lg font-black text-foreground">{request.name}</div>
                <div className="flex flex-wrap items-start gap-x-5 gap-y-1.5 text-sm">
                  <RequestDetail label="العمر" value={`${numberText(request.age)} سنة`} />
                  <RequestDetail label="تاريخ التقديم" value={formatSubmissionDate(request.createdAt)} />
                  <RequestDetail label="المحفوظ" value={formatJuzNumbers(request.memorization?.juzs || [], numberText) || 'لا يوجد محفوظ سابق'} wide />
                </div>
              </div>

              <div className="grid shrink-0 grid-cols-3 gap-1.5">
                <Button type="button" variant="outline" onClick={() => preliminaryAccept(request)} disabled={busyKey === `pre-${request.id}`} className="h-8 whitespace-nowrap border-sky-300 bg-sky-50 px-2 text-[10px] font-black text-sky-700 hover:bg-sky-100 hover:text-sky-800 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-300 sm:text-[11px]" aria-label={`قبول مبدئي لطلب ${request.name}`}>
                  {busyKey === `pre-${request.id}` ? <LoadingSpinner size="xs" /> : 'قبول مبدئي'}
                </Button>
                <Button type="button" onClick={() => openAcceptDialog(request)} className="h-8 whitespace-nowrap px-2 text-[10px] font-black shadow-none sm:text-[11px]" aria-label={`قبول نهائي لطلب ${request.name}`}>
                  قبول نهائي
                </Button>
                <Button type="button" variant="outline" onClick={() => setPendingRejection(request)} disabled={busyKey === `reject-${request.id}`} className="h-8 whitespace-nowrap border-red-300 bg-red-50 px-2 text-[10px] font-black text-red-700 hover:bg-red-100 hover:text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 sm:text-[11px]" aria-label={`رفض طلب ${request.name}`}>
                  {busyKey === `reject-${request.id}` ? <LoadingSpinner size="xs" /> : 'رفض'}
                </Button>
              </div>
            </div>
          </article>
        )) : (
          <div className="p-8 text-center font-black text-muted-foreground">
            لا توجد طلبات تسجيل حالياً.
          </div>
        )}
        </div>
      </CardContent>

      <Dialog open={Boolean(activeRequest)} onOpenChange={(open) => !open && setActiveRequest(null)}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto border-primary/30 bg-card text-foreground" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-primary">قبول طلب التسجيل</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <LabeledField label="اسم الطالب">
              <Input value={acceptForm.name} onChange={(event) => setAcceptForm({ ...acceptForm, name: event.target.value })} />
            </LabeledField>
            <LabeledField label="رقم الدخول">
              <Input value={acceptForm.loginNumber} onChange={(event) => setAcceptForm({ ...acceptForm, loginNumber: event.target.value })} />
            </LabeledField>
            <LabeledField label="رقم الجوال">
              <Input value={acceptForm.guardianPhone} onChange={(event) => setAcceptForm({ ...acceptForm, guardianPhone: event.target.value })} />
            </LabeledField>
            <LabeledField label="رقم الهوية">
              <Input value={acceptForm.nationalId} onChange={(event) => setAcceptForm({ ...acceptForm, nationalId: event.target.value })} />
            </LabeledField>
            <LabeledField label="العمر">
              <Input value={acceptForm.age} onChange={(event) => setAcceptForm({ ...acceptForm, age: event.target.value })} />
            </LabeledField>
            <LabeledField label="الحلقة">
              <Select value={acceptForm.committeeId} onValueChange={(value) => setAcceptForm({ ...acceptForm, committeeId: value })}>
                <SelectTrigger aria-label="الحلقة">
                  <SelectValue placeholder="اختر الحلقة" />
                </SelectTrigger>
                <SelectContent>
                  {committees.map((committee) => (
                    <SelectItem key={committee.id} value={String(committee.id)}>{committee.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </LabeledField>
          </div>

          <div className="space-y-3 rounded-2xl border border-primary/15 bg-background/60 p-4">
            <div className="flex items-center gap-2 text-lg font-black text-foreground">
              <Clipboard className="h-5 w-5 text-primary" />
              اختبار المحفوظ
            </div>
            {memorizationItems.length ? (
              <div className="space-y-2">
                {memorizationItems.map((item) => (
                  <div key={item.id} className="grid gap-2 rounded-xl border border-primary/10 bg-card/70 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="font-black text-foreground">{item.label}</div>
                      <div className="text-xs font-bold text-muted-foreground">{item.type === 'juz' ? 'جزء كامل' : 'نطاق جزئي'}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <ResultButton
                        active={testResults[item.id] === 'passed'}
                        icon={Check}
                        label="ناجح"
                        onClick={() => setTestResults({ ...testResults, [item.id]: 'passed' })}
                      />
                      <ResultButton
                        active={testResults[item.id] === 'failed'}
                        icon={X}
                        label="راسب"
                        danger
                        onClick={() => setTestResults({ ...testResults, [item.id]: 'failed' })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-primary/10 bg-card/70 p-4 text-sm font-bold text-muted-foreground">
                الطالب لم يحدد محفوظاً سابقاً.
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-start">
            <Button type="button" variant="outline" onClick={() => setActiveRequest(null)}>
              إغلاق
            </Button>
            {activeRequest ? (
              <Button type="button" variant="outline" onClick={() => preliminaryAccept(activeRequest)} disabled={busyKey === `pre-${activeRequest.id}`}>
                {busyKey === `pre-${activeRequest.id}` ? <LoadingSpinner /> : 'قبول مبدئي'}
              </Button>
            ) : null}
            <Button type="button" onClick={acceptRequest} disabled={!canAccept || busyKey === `accept-${activeRequest?.id}`}>
              {busyKey === `accept-${activeRequest?.id}` ? <LoadingSpinner /> : 'قبول نهائي'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingRejection)} onOpenChange={(open) => !open && setPendingRejection(null)}>
        <DialogContent className="max-w-md bg-card text-foreground" dir="rtl">
          <DialogHeader>
            <DialogTitle>تأكيد رفض الطلب</DialogTitle>
          </DialogHeader>
          <p className="text-sm font-bold leading-7 text-muted-foreground">
            سيتم إرسال رسالة الرفض إلى {pendingRejection?.name || 'الطالب'} ثم حذف الطلب نهائيًا.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingRejection(null)}>
              إلغاء
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={rejectRequest}
              disabled={!pendingRejection || busyKey === `reject-${pendingRejection?.id}`}
            >
              {busyKey === `reject-${pendingRejection?.id}` ? <LoadingSpinner /> : 'رفض الطلب'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

const RequestDetail = ({ label, value, wide = false }) => (
  <div className={wide ? 'min-w-[15rem] flex-1' : ''}>
    <span className="font-bold text-muted-foreground">{label}: </span>
    <span className="font-black text-foreground">{value}</span>
  </div>
);

const ResultButton = ({ active, label, icon: Icon, danger = false, onClick }) => { const _resolveClassName = () => {
                                                                                     if (active) {
                                                                                       if (danger) {
                                                                                         return 'border-destructive bg-destructive text-destructive-foreground';
                                                                                       }
                                                                                       return 'border-emerald-600 bg-emerald-600 text-white';
                                                                                     }
                                                                                     return 'border-primary/20 bg-background text-foreground hover:bg-primary/10';
                                                                                   };
                                                                                   return (<button
    type="button"
    onClick={onClick}
    className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-black transition ${
      _resolveClassName()
    }`}
  >
    <Icon className="h-4 w-4" />
    {label}
  </button>); };

export default RegistrationRequestsSection;
