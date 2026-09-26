import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import ManagementIconButton from '@/components/ui/management-icon-button';
import {
  FormField,
  FormGrid,
  ManagementEmpty,
  ManagementList,
  ManagementRow,
  ManagementToolbar,
} from '@/components/dashboard/layout/ManagementPanel';
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

  const rowActionClass = 'h-11 w-11 border-transparent bg-transparent';

  const renderStatus = (staff) => (
    <span className={staff.isActive ? 'font-bold text-emerald-600' : 'font-bold text-destructive'}>
      {staff.isActive ? 'نشط' : 'معطل'}
    </span>
  );

  const renderRows = () => {
    if (isLoading) return <DashboardLoader />;
    if (rows.length === 0) return <ManagementEmpty>لا يوجد {pluralLabel} حاليًا.</ManagementEmpty>;
    return (
      <ManagementList label={pluralLabel}>
        {rows.map((staff) => (
          <ManagementRow
            key={staff.id}
            title={staff.name}
            subtitle={(
              <>
                {setStaffActive && <span className="sm:hidden">{renderStatus(staff)} · </span>}
                {staff.committeeIds?.length
                  ? selectedCommitteeLabels(staff.committeeIds, committees).join('، ')
                  : 'بدون حلقات'}
              </>
            )}
            meta={setStaffActive ? renderStatus(staff) : null}
            onOpen={() => openForm(staff)}
            actions={(
              <>
                <ManagementIconButton className={rowActionClass} onClick={() => openForm(staff)} title={`تعديل ${singularLabel}`} aria-label={`تعديل ${staff.name}`} tone="primary">
                  <Pencil className="h-4 w-4" />
                </ManagementIconButton>
                {setStaffActive && (
                  <ManagementIconButton
                    className={rowActionClass}
                    onClick={() => toggleActive(staff)}
                    title={staff.isActive ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                    aria-label={`${staff.isActive ? 'تعطيل' : 'تفعيل'} حساب ${staff.name}`}
                  >
                    <Power className="h-4 w-4" />
                  </ManagementIconButton>
                )}
                {deleteStaff && (
                  <ManagementIconButton
                    className={rowActionClass}
                    onClick={() => { setSelected(staff); setDialog('delete'); }}
                    title="حذف"
                    aria-label={`حذف ${staff.name}`}
                    tone="destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </ManagementIconButton>
                )}
              </>
            )}
          />
        ))}
      </ManagementList>
    );
  };

  return (
    <>
      <ManagementToolbar>
        <Input
          type="search"
          aria-label={`ابحث باسم ${singularLabel}`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={`ابحث باسم ${singularLabel}`}
          className="h-11 flex-1 basis-48"
        />
        <Button onClick={() => openForm()} className="h-11 gap-2 px-5">
          <Plus className="h-4 w-4" />
          إضافة
        </Button>
      </ManagementToolbar>
      {renderRows()}

      <Dialog open={dialog === 'form'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="border-primary/30 bg-card text-foreground [font-family:var(--font-ui)]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-primary neon-text">{selected ? `تعديل ${singularLabel}` : `إضافة ${singularLabel}`}</DialogTitle>
          </DialogHeader>
          <FormGrid className="py-4">
            <FormField label="الاسم" htmlFor="staff-name">
              <Input id="staff-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={`اكتب اسم ${singularLabel}`} />
            </FormField>
            <FormField label="رقم الهوية" htmlFor="staff-national-id">
              <Input id="staff-national-id" value={form.nationalId} onChange={(event) => setForm({ ...form, nationalId: event.target.value })} placeholder="رقم الهوية" />
            </FormField>
            <FormField label="رقم الدخول" htmlFor="staff-login-number">
              <Input id="staff-login-number" value={form.loginNumber} onChange={(event) => setForm({ ...form, loginNumber: event.target.value })} placeholder="رقم الدخول" />
            </FormField>
            <FormField label="رقم الجوال" htmlFor="staff-phone">
              <Input id="staff-phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="رقم الجوال" />
            </FormField>
            <FormField
              wide
              label={`الحلقات المرتبطة بـ${singularLabel}`}
              htmlFor="staff-committees"
              hint={committees.length === 0 ? 'أضف الحلقات أولًا.' : null}
            >
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
            </FormField>
          </FormGrid>
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
    </>
  );
};

export default CommitteeStaffSection;
