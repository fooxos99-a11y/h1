import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, History, Link2, RefreshCw, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SettingToggle from '@/components/ui/setting-toggle';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import ErrorState from '@/components/ui/error-state';
import NazemAccountLinkDialog from '@/components/dashboard/NazemAccountLinkDialog';
import NazemStudentPlanImportDialog from '@/components/dashboard/NazemStudentPlanImportDialog';
import NazemUnlinkDialog from '@/components/dashboard/NazemUnlinkDialog';
import NazemIdentityConfirmDialog from '@/components/dashboard/NazemIdentityConfirmDialog';
import NazemErrorsDialog from '@/components/dashboard/NazemErrorsDialog';
import NazemLogDialog from '@/components/dashboard/NazemLogDialog';
import NazemBulkRefresh from '@/components/dashboard/NazemBulkRefresh';
import { nazemIntegrationApi } from '@/services/nazemIntegrationApi';
import {
  readNazemIntegrationStateCache,
  writeNazemIntegrationStateCache,
} from '@/services/nazemIntegrationStateCache';
import { useToast } from '@/components/ui/use-toast';

const connectingStatuses = new Set(['pending', 'verifying', 'retrying']);
const NazemIntegrationSettings = ({ onConfigChange }) => {
  const { toast } = useToast();
  const [initialCache] = useState(() => readNazemIntegrationStateCache());
  const [config, setConfig] = useState(initialCache?.config || null);
  const [accounts, setAccounts] = useState(initialCache?.accounts || null);
  const [accountsCacheAt, setAccountsCacheAt] = useState(initialCache?.accountsUpdatedAt || null);
  const [linkTeacher, setLinkTeacher] = useState(null);
  const [importTeacher, setImportTeacher] = useState(null);
  const [unlinkTeacher, setUnlinkTeacher] = useState(null);
  const [identityTeacher, setIdentityTeacher] = useState(null);
  const [logOpen, setLogOpen] = useState(false);
  const [errorsOpen, setErrorsOpen] = useState(false);
  const [busyTeacherId, setBusyTeacherId] = useState(null);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async ({ background = false } = {}) => {
    if (!background) setLoadError('');
    const [configResult, accountsResult] = await Promise.allSettled([
      nazemIntegrationApi.getConfig(),
      nazemIntegrationApi.getAccounts(),
    ]);
    const cacheUpdate = {};
    if (configResult.status === 'fulfilled') {
      setConfig(configResult.value);
      cacheUpdate.config = configResult.value;
    }
    if (accountsResult.status === 'fulfilled') {
      setAccounts(accountsResult.value);
      cacheUpdate.accounts = accountsResult.value;
    }
    const updatedCache = writeNazemIntegrationStateCache(cacheUpdate);
    if (accountsResult.status === 'fulfilled') setAccountsCacheAt(updatedCache?.accountsUpdatedAt || Date.now());
    const errors = [configResult, accountsResult]
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason?.message || 'تعذر تحميل تكامل ناظم.');
    if (errors.length) {
      const message = [...new Set(errors)].join(' ');
      setLoadError(message);
      if (!background) toast({ title: 'تعذر تحميل تكامل ناظم', description: message, variant: 'destructive' });
    } else {
      setLoadError('');
    }
  }, [toast]);

  useEffect(() => {
    load({ background: Boolean(initialCache?.config || initialCache?.accounts) });
  }, [initialCache, load]);


  useEffect(() => {
    const hasPendingWork = accounts?.some((account) => (
      ['pending', 'verifying', 'retrying'].includes(account.status)
    ));
    if (!config?.enabled || !hasPendingWork) return undefined;
    let active = true;
    let requestPending = false;
    const refreshAccounts = async () => {
      if (requestPending) return;
      requestPending = true;
      try {
        const updatedAccounts = await nazemIntegrationApi.getAccounts();
        if (!active) return;
        setAccounts(updatedAccounts);
        const updatedCache = writeNazemIntegrationStateCache({ accounts: updatedAccounts });
        setAccountsCacheAt(updatedCache?.accountsUpdatedAt || Date.now());
        setLoadError('');
      } catch (error) {
        if (active) setLoadError(error?.message || 'تعذر تحديث حسابات ناظم مؤقتًا.');
      } finally {
        requestPending = false;
      }
    };
    const timer = window.setInterval(refreshAccounts, 4_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [accounts, config?.enabled]);

  const toggle = async (enabled) => {
    if (enabled && !config?.runtime?.ready) {
      toast({
        title: 'بيئة ناظم غير جاهزة',
        description: config?.runtime?.issues?.join(' ') || 'أكمل إعداد الخادم أولًا.',
        variant: 'destructive',
      });
      return;
    }
    try {
      setToggleBusy(true);
      setConfig((current) => ({ ...(current), enabled }));
      const updatedConfig = await nazemIntegrationApi.updateConfig(enabled);
      await load();
      onConfigChange?.(enabled, updatedConfig?.recitationAmountDay);
    } catch (error) {
      toast({ title: 'تعذر تحديث تكامل ناظم', description: error.message, variant: 'destructive' });
      await load();
    } finally {
      setToggleBusy(false);
    }
  };

  const link = async (credentials) => {
    try {
      setBusyTeacherId(linkTeacher.teacherId);
      await nazemIntegrationApi.linkAccount(linkTeacher.teacherId, credentials);
      setLinkTeacher(null);
      await load();
    } catch (error) {
      toast({ title: 'تعذر بدء الربط', description: error.message, variant: 'destructive' });
    } finally {
      setBusyTeacherId(null);
    }
  };

  const confirmIdentity = async (account) => {
    try {
      setBusyTeacherId(account.teacherId);
      await nazemIntegrationApi.confirmAccountIdentity(account.teacherId, {
        externalTeacherName: account.externalTeacherName,
        externalOrganizationName: account.externalOrganizationName || '',
      });
      setIdentityTeacher(null);
      await load();
    } catch (error) {
      toast({ title: 'تعذر اعتماد الحساب', description: error.message, variant: 'destructive' });
    } finally {
      setBusyTeacherId(null);
    }
  };

  const unlink = async () => {
    const teacherId = unlinkTeacher?.teacherId;
    if (!teacherId) return;
    try {
      setBusyTeacherId(teacherId);
      await nazemIntegrationApi.unlinkAccount(teacherId);
      setUnlinkTeacher(null);
      await load();
    } catch (error) {
      toast({ title: 'تعذر إلغاء الربط', description: error.message, variant: 'destructive' });
    } finally {
      setBusyTeacherId(null);
    }
  };

  const openImport = (account) => setImportTeacher(account);
  const closeImport = () => setImportTeacher(null);

  if (loadError && !config) return <ErrorState message={loadError} onRetry={load} />;
  if (!config) return <DashboardLoader />;

  const _resolveNazemIntegrationSettings = () => {
    if (loadError && accounts) {
      return <output className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900" >
          <span>
            تعذر تحديث حالة ناظم الآن. تظهر آخر بيانات محفوظة
            {accountsCacheAt ? ` من ${new Intl.DateTimeFormat('ar-SA', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(accountsCacheAt))}` : ''}.
          </span>
          <Button type="button" variant="outline" className="min-h-11 bg-white" onClick={() => load()}>
            إعادة المحاولة
          </Button>
        </output>;
    }
    if (loadError) {
      return <ErrorState className="min-h-0" message={loadError} onRetry={load} />;
    }
    return null;
  };
  return (
    <section className="space-y-4 border-t border-primary/15 p-4 [font-family:var(--font-ui)] sm:p-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-black text-primary">ناظم</h3>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="min-h-11 gap-2" onClick={() => setErrorsOpen(true)}>
            <AlertTriangle className="h-4 w-4" />
            الأخطاء
          </Button>
          <Button type="button" variant="outline" className="min-h-11 gap-2" onClick={() => setLogOpen(true)}>
            <History className="h-4 w-4" />
            سجل ناظم
          </Button>
        </div>
      </div>

      {_resolveNazemIntegrationSettings()}

      <SettingToggle
        label="ناظم"
        checked={config.enabled}
        disabled={toggleBusy || (!config.enabled && !config.runtime?.ready)}
        onCheckedChange={toggle}
      />

      {!config.runtime?.ready && (
        <ErrorState
          className="min-h-0"
          message={config.runtime?.issues?.join(' ') || 'بيئة تشغيل ناظم غير جاهزة.'}
          onRetry={load}
        />
      )}

      {config.enabled && accounts && (
        <div className="space-y-2">
          <NazemBulkRefresh accounts={accounts} disabled={!config.runtime?.ready} onChanged={load} />
          {accounts.map((account) => {
            const linked = Boolean(account.status);
            const connected = account.status === 'connected';
            const busy = busyTeacherId === account.teacherId;
            return (
              <div key={account.teacherId} className="grid gap-3 rounded-xl border border-primary/15 bg-card p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="font-black text-foreground">{account.teacherName}</div>
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  {!linked ? (
                    <Button type="button" className="min-h-11 gap-2" disabled={!config.runtime?.ready} onClick={() => setLinkTeacher(account)}><Link2 className="h-4 w-4" />ربط</Button>
                  ) : (
                    <>
                      {linked && (
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11 min-w-44 gap-2"
                          disabled={!connected || busy}
                          onClick={() => openImport(account)}
                        >
                          <RefreshCw className="h-4 w-4" />
                          استيراد
                        </Button>
                      )}
                      <Button type="button" variant="destructive" className="min-h-11 gap-2" disabled={busy} onClick={() => setUnlinkTeacher(account)}><Unlink className="h-4 w-4" />إلغاء الربط</Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {config.enabled && !accounts && !loadError && <DashboardLoader className="min-h-32" />}

      <NazemAccountLinkDialog
        open={Boolean(linkTeacher)}
        teacher={linkTeacher}
        busy={busyTeacherId === linkTeacher?.teacherId}
        onOpenChange={(open) => !open && setLinkTeacher(null)}
        onSubmit={link}
      />
      {importTeacher && (
        <NazemStudentPlanImportDialog
          open
          teacher={importTeacher}
          onOpenChange={(open) => !open && closeImport()}
          onChanged={load}
        />
      )}
      <NazemUnlinkDialog
        teacher={unlinkTeacher}
        busy={busyTeacherId === unlinkTeacher?.teacherId}
        onOpenChange={(open) => !open && setUnlinkTeacher(null)}
        onConfirm={unlink}
      />
      <NazemIdentityConfirmDialog
        account={identityTeacher}
        busy={busyTeacherId === identityTeacher?.teacherId}
        onOpenChange={(open) => !open && setIdentityTeacher(null)}
        onConfirm={confirmIdentity}
      />
      <NazemLogDialog open={logOpen} onOpenChange={setLogOpen} />
      <NazemErrorsDialog
        open={errorsOpen}
        onOpenChange={setErrorsOpen}
        onChanged={() => load({ background: true })}
        onEditAccount={setLinkTeacher}
        onConfirmIdentity={setIdentityTeacher}
      />
    </section>
  );
};

export default NazemIntegrationSettings;
