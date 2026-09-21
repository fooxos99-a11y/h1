import React, { useCallback, useEffect, useState } from 'react';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import ManagementIconButton from '@/components/ui/management-icon-button';
import { studentsApi } from '@/services/studentsApi';
import useRewardUnits from '@/hooks/useRewardUnits';
import useOnlineStatus from '@/hooks/useOnlineStatus';
import { loadOfflineSnapshot } from '@/services/offlineOperationsService';

const emptyFamily = { name: '', points: 0 };
const FamiliesSection = () => {
  const isOnline = useOnlineStatus();
  const accountId = Number(localStorage.getItem('wajeh_account_id') || localStorage.getItem('wajeh_supervisor_id') || 0);
  const actorRole = localStorage.getItem('wajeh_role') || 'manager';
  const rewardUnits = useRewardUnits();
  const { toast } = useToast();
  const [families, setFamilies] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyFamily);
  const [selectedFamily, setSelectedFamily] = useState(null);
  const [previewStudents, setPreviewStudents] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadFamilies = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await loadOfflineSnapshot(
        accountId,
        `management:families:${isOnline ? search : ''}`,
        () => studentsApi.getFamilies({ search }),
        { actorRole },
      );
      const normalizedSearch = search.trim().toLocaleLowerCase('ar');
      setFamilies(!isOnline && normalizedSearch
        ? rows.filter((family) => String(family.name || '').toLocaleLowerCase('ar').includes(normalizedSearch))
        : rows);
    } finally {
      setIsLoading(false);
    }
  }, [accountId, actorRole, isOnline, search]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadFamilies().catch((error) => {
        toast({ title: 'تعذر تحميل الحلقات', description: error.message, variant: 'destructive' });
      });
    }, 250);

    return () => clearTimeout(timeout);
  }, [loadFamilies, toast]);

  const openAddDialog = () => {
    setSelectedFamily(null);
    setForm(emptyFamily);
    setDialog('form');
  };

  const openEditDialog = (family) => {
    setSelectedFamily(family);
    setForm({ name: family.name || '', points: Number(family.points || 0) });
    setDialog('form');
  };

  const saveFamily = async () => {
    try {
      if (selectedFamily) {
        await studentsApi.updateFamily(selectedFamily.id, form);
        toast({ title: 'تم التحديث', description: 'تم تحديث بيانات الحلقة.' });
      } else {
        await studentsApi.createFamily(form);
        toast({ title: 'تم الحفظ', description: 'تمت إضافة الحلقة.' });
      }
      setDialog(null);
      setSelectedFamily(null);
      setForm(emptyFamily);
      await loadFamilies();
    } catch (error) {
      toast({ title: 'تعذر الحفظ', description: error.message, variant: 'destructive' });
    }
  };

  const confirmDelete = (family) => {
    setSelectedFamily(family);
    setDialog('delete');
  };

  const deleteFamily = async () => {
    if (!selectedFamily) return;
    try {
      const result = await studentsApi.deleteFamily(selectedFamily.id);
      toast({
        title: 'تم الحذف',
        description: result.detachedStudents
          ? `تم حذف الحلقة والإبقاء على ${result.detachedStudents} طالب بلا حلقة.`
          : 'تم حذف الحلقة.',
      });
      setDialog(null);
      setSelectedFamily(null);
      await loadFamilies();
    } catch (error) {
      toast({ title: 'تعذر الحذف', description: error.message, variant: 'destructive' });
    }
  };

  const openPreview = async (family) => {
    setSelectedFamily(family);
    setDialog('preview');
    try {
      const students = await loadOfflineSnapshot(
        accountId,
        `management:family-students:${family.id}`,
        () => studentsApi.getFamilyStudents(family.id),
        { actorRole },
      );
      setPreviewStudents(students);
      setFamilies((current) =>
        current.map((item) =>
          item.id === family.id ? { ...item, studentsCount: students.length } : item
        )
      );
    } catch (error) {
      setPreviewStudents([]);
      toast({ title: 'تعذر تحميل الطلاب', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      {!isOnline ? <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-center text-sm font-black text-amber-700">عرض محلي للقراءة فقط حتى عودة الاتصال.</div> : null}
      <Card className="bg-card border-primary/30 neon-glow">
        <CardHeader className="border-b border-primary/20">
          <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <Input
                aria-label="ابحث باسم الحلقة"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ابحث باسم الحلقة"
                className="bg-background border-primary/30 text-foreground"
              />
              <Button onClick={openAddDialog} disabled={!isOnline} className="min-w-20 px-4">
                إضافة
              </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <DashboardLoader />
          ) : families.length === 0 ? (
            <div className="rounded-xl border border-dashed border-primary/20 py-12 text-center text-muted-foreground">
              لا توجد حلقات حالياً.
            </div>
          ) : (
            <div className="space-y-3">
              {families.map((family) => (
                <div key={family.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-xl border border-primary/20 bg-background p-4">
                  <div className="min-w-0">
                    <Button variant="link" disabled={!isOnline} onClick={() => openEditDialog(family)} className="h-auto p-0 text-lg font-bold text-primary">
                      {family.name}
                    </Button>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <ManagementIconButton disabled={!isOnline} onClick={() => openEditDialog(family)} title="تعديل الحلقة" aria-label={`تعديل ${family.name}`} tone="primary">
                      <Pencil className="h-4 w-4" />
                    </ManagementIconButton>
                    <ManagementIconButton onClick={() => openPreview(family)} title="معاينة الطلاب" aria-label={`معاينة طلاب ${family.name}`}>
                      <Eye className="h-4 w-4" />
                    </ManagementIconButton>
                    <ManagementIconButton disabled={!isOnline} onClick={() => confirmDelete(family)} title="حذف" aria-label={`حذف ${family.name}`} tone="destructive">
                      <Trash2 className="h-4 w-4" />
                    </ManagementIconButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialog === 'form'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="bg-card border-primary/30 text-foreground" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-primary neon-text">
              {selectedFamily ? 'تعديل الحلقة' : 'إضافة حلقة'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="family-name">اسم الحلقة</Label>
              <Input id="family-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="اكتب الاسم" />
            </div>
            {selectedFamily ? (
              <div className="space-y-2">
                <Label htmlFor="family-points">{rewardUnits.text('الكيلومترات')}</Label>
                <Input
                  id="family-points"
                  type="number"
                  min="0"
                  value={form.points}
                  onChange={(event) => setForm({ ...form, points: Number(event.target.value || 0) })}
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>إلغاء</Button>
            <Button onClick={saveFamily}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'preview'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="bg-card border-primary/30 text-foreground max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-primary neon-text">طلاب {selectedFamily?.name}</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto rounded-xl border border-primary/20">
            {previewStudents.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">لا يوجد طلاب في هذه الحلقة.</div>
            ) : (
              previewStudents.map((student) => (
                <div key={student.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-primary/10 p-3 last:border-b-0">
                  <span className="min-w-0 truncate font-medium">{student.name}</span>
                  <span className="shrink-0 text-muted-foreground" dir="ltr">{student.guardianPhone || '-'}</span>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'delete'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="bg-card border-primary/30 text-foreground" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-primary neon-text">تأكيد الحذف</DialogTitle>
          </DialogHeader>
          <p className="py-4 text-muted-foreground">
            هل تريد حذف حلقة {selectedFamily?.name}؟
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={deleteFamily}>حذف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FamiliesSection;
