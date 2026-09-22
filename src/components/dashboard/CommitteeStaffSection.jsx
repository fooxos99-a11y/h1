import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Power, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import ManagementIconButton from '@/components/ui/management-icon-button';
import { studentsApi } from '@/services/studentsApi';

const emptyStaff = { name: '', loginNumber: '', nationalId: '', phone: '', committeeIds: [] };

const selectedCommitteeLabels = (committeeIds = [], committees = []) => {
  const selected = new Set(committeeIds.map(String));
  return committees.filter((committee) => selected.has(String(committee.id))).map((committee) => committee.name);
};

const CommitteeStaffSection = ({
  singularLabel,
  pluralLabel,
  loadStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  setStaffActive,
}) => {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [committees, setCommittees] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyStaff);
  const [selected, setSelected] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [staffRows, committeeRows] = await Promise.all([
        loadStaff({ search }),
        studentsApi.getCommittees(),
      ]);
      setRows(staffRows);
      setCommittees(committeeRows);
    } finally {
      setIsLoading(false);
    }
  }, [loadStaff, search]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      load().catch((error) => toast({
        title: `تعذر تحميل ${pluralLabel}`,
        description: error.message,
        variant: 'destructive',
      }));
    }, 250);
    return () => clearTimeout(timeout);
  }, [load, pluralLabel, toast]);

  const openForm = (staff = null) => {
    setSelected(staff);
    setForm(staff ? {
      name: staff.name || '',
      loginNumber: staff.loginNumber || '',
      nationalId: staff.nationalId || '',
      phone: staff.phone || '',
      committeeIds: staff.committeeIds || [],
    } : emptyStaff);
    setDialog('form');
  };

  const toggleCommittee = (committeeId) => {
    setForm((current) => {
      const id = String(committeeId);
      const committeeIds = current.committeeIds.map(String);
      return {
        ...current,
        committeeIds: committeeIds.includes(id)
          ? committeeIds.filter((item) => item !== id)
          : [...committeeIds, id],
      };
    });
  };

  const save = async () => {
    setIsSaving(true);
    try {
      if (selected) await updateStaff(selected.id, form);
      else await createStaff(form);
      toast({
        title: selected ? 'تم التحديث' : 'تم الحفظ',
        description: selected ? `تم تحديث بيانات ${singularLabel}.` : `تم إنشاء حساب ${singularLabel}.`,
      });
      setDialog(null);
      setSelected(null);
      setForm(emptyStaff);
      await load();
    } catch (error) {
      toast({ title: 'تعذر الحفظ', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async () => {
    if (!selected || !deleteStaff) return;
    setIsSaving(true);
    try {
      await deleteStaff(selected.id);
      toast({ title: 'تم الحذف', description: `تم حذف ${singularLabel}.` });
      setDialog(null);
      setSelected(null);
      await load();
    } catch (error) {
      toast({ title: 'تعذر الحذف', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async (staff) => {
    if (!setStaffActive) return;
    try {
      await setStaffActive(staff.id, !staff.isActive);
      toast({
        title: staff.isActive ? 'تم تعطيل الحساب' : 'تم تفعيل الحساب',
        description: staff.isActive
          ? `لن يتمكن ${singularLabel} من تسجيل الدخول.`
          : `يمكن لـ${singularLabel} تسجيل الدخول الآن.`,
      });
      await load();
    } catch (error) {
      toast({ title: 'تعذر تغيير الحالة', description: error.message, variant: 'destructive' });
    }
  };

  const committeeLabels = selectedCommitteeLabels(form.committeeIds, committees);

  const _resolveCommitteeStaffSection = () => {
    if (isLoading) {
      return <DashboardLoader />;
    }
    if (rows.length === 0) {
      return <div className="rounded-xl border border-dashed border-primary/20 py-12 text-center text-muted-foreground">
              لا يوجد {pluralLabel} حاليًا.
            </div>;
    }
    return <div className="space-y-3">
              {rows.map((staff) => (
                <div key={staff.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-xl border border-primary/20 bg-background p-4">
                  <div className="min-w-0 space-y-1">
                    <Button variant="link" onClick={() => openForm(staff)} className="h-auto p-0 text-lg font-bold text-primary">
                      {staff.name}
                    </Button>
                    <p className="truncate text-sm text-muted-foreground">
                      {staff.committeeIds?.length
                        ? selectedCommitteeLabels(staff.committeeIds, committees).join('، ')
                        : 'بدون حلقات'}
                    </p>
                    {setStaffActive && (
                      <span className={staff.isActive ? 'text-xs font-bold text-emerald-600' : 'text-xs font-bold text-destructive'}>
                        {staff.isActive ? 'نشط' : 'معطل'}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <ManagementIconButton onClick={() => openForm(staff)} title={`تعديل ${singularLabel}`} aria-label={`تعديل ${staff.name}`} tone="primary">
                      <Pencil className="h-4 w-4" />
                    </ManagementIconButton>
                    {setStaffActive && (
                      <ManagementIconButton
                        onClick={() => toggleActive(staff)}
                        title={staff.isActive ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                        aria-label={`${staff.isActive ? 'تعطيل' : 'تفعيل'} حساب ${staff.name}`}
                      >
                        <Power className="h-4 w-4" />
                      </ManagementIconButton>
                    )}
                    {deleteStaff && (
                      <ManagementIconButton
                        onClick={() => { setSelected(staff); setDialog('delete'); }}
                        title="حذف"
                        aria-label={`حذف ${staff.name}`}
                        tone="destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </ManagementIconButton>
                    )}
                  </div>
                </div>
              ))}
            </div>;
  };
  return (
    <div className="space-y-6 [font-family:var(--font-ui)]" dir="rtl">
      <Card className="border-primary/30 bg-card neon-glow">
        <CardHeader className="border-b border-primary/20">
          <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <Input
              aria-label={`ابحث باسم ${singularLabel}`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`ابحث باسم ${singularLabel}`}
              className="h-11 border-primary/30 bg-background text-foreground"
            />
            <Button onClick={() => openForm()} className="h-11 min-w-20 px-4">إضافة</Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {_resolveCommitteeStaffSection()}
        </CardContent>
      </Card>

      <Dialog open={dialog === 'form'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="border-primary/30 bg-card text-foreground [font-family:var(--font-ui)]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-primary neon-text">{selected ? `تعديل ${singularLabel}` : `إضافة ${singularLabel}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="staff-name">الاسم</Label>
                <Input id="staff-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={`اكتب اسم ${singularLabel}`} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="staff-national-id">رقم الهوية</Label>
                <Input id="staff-national-id" value={form.nationalId} onChange={(event) => setForm({ ...form, nationalId: event.target.value })} placeholder="رقم الهوية" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="staff-login-number">رقم الدخول</Label>
                <Input id="staff-login-number" value={form.loginNumber} onChange={(event) => setForm({ ...form, loginNumber: event.target.value })} placeholder="رقم الدخول" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="staff-phone">رقم الجوال</Label>
                <Input id="staff-phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="رقم الجوال" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-committees">الحلقات المرتبطة بـ{singularLabel}</Label>
              <Select value="" onValueChange={toggleCommittee} disabled={committees.length === 0}>
                <SelectTrigger id="staff-committees" className="min-h-11 border-primary/30 bg-background">
                  <span className={`truncate ${committeeLabels.length ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {committeeLabels.length ? committeeLabels.join('، ') : 'اختر الحلقات'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {committees.map((committee) => {
                    const active = form.committeeIds.map(String).includes(String(committee.id));
                    return <SelectItem key={committee.id} value={String(committee.id)}>{active ? '✓ ' : ''}{committee.name}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
              {committees.length === 0 && <div className="text-sm text-muted-foreground">أضف الحلقات أولًا.</div>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} className="h-11">إلغاء</Button>
            <Button onClick={save} loading={isSaving} className="h-11">حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'delete'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="border-primary/30 bg-card text-foreground [font-family:var(--font-ui)]" dir="rtl">
          <DialogHeader><DialogTitle className="text-primary neon-text">تأكيد الحذف</DialogTitle></DialogHeader>
          <p className="py-4 text-muted-foreground">هل تريد حذف {singularLabel} {selected?.name}؟</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} className="h-11">إلغاء</Button>
            <Button variant="destructive" onClick={remove} loading={isSaving} className="h-11">حذف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CommitteeStaffSection;
