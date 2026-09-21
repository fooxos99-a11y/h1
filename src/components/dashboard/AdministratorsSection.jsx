import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Edit3, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/components/ui/use-toast';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import { dashboardPermissionOptions } from '@/lib/dashboardPermissions';
import useMediaQuery from '@/hooks/useMediaQuery';
import { studentsApi } from '@/services/studentsApi';
import useRewardUnits from '@/hooks/useRewardUnits';

const emptyAdministrator = {
  name: '',
  loginNumber: '',
  nationalId: '',
  phone: '',
  jobTitle: 'إداري',
  permissions: [],
};

const adminPermissionOptions = dashboardPermissionOptions.filter((option) => option.key !== 'quranEvaluation');

const selectedLabels = (selected = []) => {
  const values = new Set((Array.isArray(selected) ? selected : []).map(String));
  return adminPermissionOptions.filter((option) => values.has(option.key)).map((option) => option.label);
};

const PermissionsTrigger = React.forwardRef(({ id, labels, open, onClick, disabled, rewardUnits, ...triggerProps }, ref) => (
  <button
    ref={ref}
    id={id}
    type="button"
    disabled={disabled}
    aria-haspopup="listbox"
    aria-expanded={open}
    onClick={onClick}
    className="select-trigger-solid relative flex min-h-12 w-full items-center rounded-md border border-primary/30 bg-background py-2.5 pl-10 pr-3 text-right text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    {...triggerProps}
  >
    {labels.length ? (
      <span className="flex min-w-0 flex-1 flex-wrap gap-1.5 pl-2 text-foreground">
        {labels.map((label) => (
          <span key={label} className="max-w-full whitespace-normal break-words rounded-md border border-primary/15 bg-primary/10 px-2 py-1 text-xs font-bold leading-5">
            {rewardUnits.text(label)}
          </span>
        ))}
      </span>
    ) : <span className="text-muted-foreground">اختر الصلاحيات</span>}
    <ChevronDown className={`absolute left-3 h-4 w-4 opacity-50 transition-transform ${open ? 'rotate-180' : ''}`} />
  </button>
));
PermissionsTrigger.displayName = 'PermissionsTrigger';

const PermissionOptionsList = ({ values, onToggle, rewardUnits, className = '' }) => (
  <div
    role="listbox"
    aria-label="صلاحيات الصفحات"
    aria-multiselectable="true"
    className={`text-right text-foreground ${className}`}
  >
    {adminPermissionOptions.map((option) => {
      const selected = values.has(option.key);
      return (
        <button
          key={option.key}
          type="button"
          role="option"
          aria-selected={selected}
          onClick={() => onToggle(option.key)}
          className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-right outline-none transition focus-visible:ring-2 focus-visible:ring-primary/50 ${
            selected
              ? 'border-primary/25 bg-primary/10 text-popover-foreground'
              : 'border-transparent bg-popover text-popover-foreground hover:border-primary/15 hover:bg-primary/5'
          }`}
        >
          <span className="min-w-0 flex-1 whitespace-normal break-words text-sm font-black leading-6 text-popover-foreground">
            {rewardUnits.text(option.label)}
          </span>
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-primary/25 bg-background'}`}>
            {selected && <Check className="h-4 w-4" />}
          </span>
        </button>
      );
    })}
  </div>
);

const PermissionsSelect = ({ id, value, onToggle, disabled = false }) => {
  const rewardUnits = useRewardUnits();
  const isMobile = useMediaQuery('(max-width: 639px)');
  const labels = selectedLabels(value);
  const values = new Set((Array.isArray(value) ? value : []).map(String));
  const [open, setOpen] = useState(false);

  if (isMobile) {
    return (
      <>
        <PermissionsTrigger
          id={id}
          labels={labels}
          open={open}
          onClick={() => setOpen(true)}
          disabled={disabled}
          rewardUnits={rewardUnits}
        />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            className="grid h-[calc(100dvh-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-3 [font-family:var(--font-ui)]"
            dir="rtl"
          >
            <DialogHeader>
              <DialogTitle>الصلاحيات</DialogTitle>
            </DialogHeader>
            <PermissionOptionsList
              values={values}
              onToggle={onToggle}
              rewardUnits={rewardUnits}
              className="min-h-0 space-y-1 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]"
            />
            <DialogFooter>
              <Button type="button" onClick={() => setOpen(false)}>تم</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <PermissionsTrigger
          id={id}
          labels={labels}
          open={open}
          onClick={undefined}
          disabled={disabled}
          rewardUnits={rewardUnits}
        />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={12}
        className="z-[160] max-h-[min(24rem,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-1.5rem)] overflow-y-auto overscroll-contain p-1.5 text-popover-foreground touch-pan-y [-webkit-overflow-scrolling:touch] sm:min-w-[26rem]"
        dir="rtl"
      >
        <PermissionOptionsList values={values} onToggle={onToggle} rewardUnits={rewardUnits} className="space-y-1" />
      </PopoverContent>
    </Popover>
  );
};

const AdministratorsSection = () => {
  const { toast } = useToast();
  const [administrators, setAdministrators] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyAdministrator);
  const [selectedAdministrator, setSelectedAdministrator] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadAdministrators = async () => {
    setIsLoading(true);
    try {
      setAdministrators(await studentsApi.getAdministrators());
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAdministrators().catch((error) => {
      toast({ title: 'تعذر تحميل الإداريين', description: error.message, variant: 'destructive' });
    });
  }, [toast]);

  const visibleAdministrators = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return administrators;
    return administrators.filter((administrator) =>
      [administrator.name, administrator.loginNumber, administrator.phone, administrator.jobTitle]
        .some((value) => String(value || '').toLowerCase().includes(term))
    );
  }, [administrators, search]);

  const openAddDialog = () => {
    setSelectedAdministrator(null);
    setForm(emptyAdministrator);
    setDialog('form');
  };

  const openEditDialog = (administrator) => {
    if (administrator.role === 'manager') return;
    setSelectedAdministrator(administrator);
    setForm({
      name: administrator.name || '',
      loginNumber: administrator.loginNumber || '',
      nationalId: administrator.nationalId || '',
      phone: administrator.phone || '',
      jobTitle: administrator.jobTitle || 'إداري',
      permissions: administrator.permissions || [],
    });
    setDialog('form');
  };

  const togglePermission = (permission) => {
    setForm((current) => {
      const selected = Array.isArray(current.permissions) ? current.permissions : [];
      const exists = selected.includes(permission);
      return {
        ...current,
        permissions: exists ? selected.filter((item) => item !== permission) : [...selected, permission],
      };
    });
  };

  const saveAdministrator = async () => {
    setIsSaving(true);
    try {
      if (selectedAdministrator) {
        await studentsApi.updateAdministrator(selectedAdministrator.id, form);
        toast({ title: 'تم التحديث', description: 'تم تحديث بيانات الإداري.' });
      } else {
        await studentsApi.createAdministrator(form);
        toast({ title: 'تم الحفظ', description: 'تم إنشاء حساب الإداري.' });
      }
      setDialog(null);
      setSelectedAdministrator(null);
      setForm(emptyAdministrator);
      await loadAdministrators();
    } catch (error) {
      toast({ title: 'تعذر الحفظ', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = (administrator) => {
    if (administrator.role === 'manager') return;
    setSelectedAdministrator(administrator);
    setDialog('delete');
  };

  const deleteAdministrator = async () => {
    if (!selectedAdministrator) return;
    setIsSaving(true);
    try {
      await studentsApi.deleteAdministrator(selectedAdministrator.id);
      toast({ title: 'تم الحذف', description: 'تم حذف الإداري.' });
      setDialog(null);
      setSelectedAdministrator(null);
      await loadAdministrators();
    } catch (error) {
      toast({ title: 'تعذر الحذف', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-card border-primary/30 neon-glow">
        <CardHeader className="border-b border-primary/20">
          <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <Input
              aria-label="ابحث باسم الإداري"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث باسم الإداري"
              className="bg-background border-primary/30 text-foreground"
            />
            <Button onClick={openAddDialog} className="min-w-20 px-4">
              إضافة
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <DashboardLoader />
          ) : visibleAdministrators.length === 0 ? (
            <div className="rounded-xl border border-dashed border-primary/20 py-12 text-center text-muted-foreground">
              لا يوجد إداريون حالياً.
            </div>
          ) : (
            <div className="space-y-3">
              {visibleAdministrators.map((administrator) => {
                return (
                  <div
                    key={administrator.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-xl border border-primary/20 bg-background p-4"
                  >
                    <div className="min-w-0">
                      <button
                        type="button"
                        disabled={administrator.role === 'manager'}
                        onClick={() => openEditDialog(administrator)}
                        className="inline-flex min-h-11 max-w-full items-center gap-2 text-right text-lg font-bold text-primary disabled:cursor-default disabled:opacity-100"
                      >
                        <ShieldCheck className="h-4 w-4 shrink-0" />
                        <span className="truncate">{administrator.name}</span>
                      </button>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {administrator.role !== 'manager' && (
                        <>
                          <Button variant="outline" size="icon" onClick={() => openEditDialog(administrator)} title="تعديل">
                            <Edit3 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => confirmDelete(administrator)}
                            title="حذف"
                            className="border-destructive/50 text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialog === 'form'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="bg-card border-primary/30 text-foreground" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-primary neon-text">
              {selectedAdministrator ? 'تعديل الإداري' : 'إضافة إداري'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="administrator-name">اسم الإداري</Label>
                <Input id="administrator-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="administrator-national-id">رقم الهوية</Label>
                <Input id="administrator-national-id" value={form.nationalId} onChange={(event) => setForm({ ...form, nationalId: event.target.value })} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="administrator-login-number">رقم الدخول</Label>
                <Input id="administrator-login-number" value={form.loginNumber} onChange={(event) => setForm({ ...form, loginNumber: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="administrator-phone">رقم الجوال</Label>
                <Input id="administrator-phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="administrator-job-title">المسمى</Label>
                <Input id="administrator-job-title" value={form.jobTitle} onChange={(event) => setForm({ ...form, jobTitle: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="administrator-permissions">الصلاحيات</Label>
                <PermissionsSelect id="administrator-permissions" value={form.permissions} onToggle={togglePermission} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>إلغاء</Button>
            <Button onClick={saveAdministrator} loading={isSaving}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'delete'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="bg-card border-primary/30 text-foreground" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-primary neon-text">تأكيد الحذف</DialogTitle>
          </DialogHeader>
          <p className="py-4 text-muted-foreground">
            هل تريد حذف الإداري {selectedAdministrator?.name}؟
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={deleteAdministrator} loading={isSaving}>حذف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdministratorsSection;
