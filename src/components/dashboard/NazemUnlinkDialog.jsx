import React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const NazemUnlinkDialog = ({ teacher, busy, onOpenChange, onConfirm }) => (
  <Dialog open={Boolean(teacher)} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-md [font-family:var(--font-ui)]" dir="rtl">
      <DialogHeader><DialogTitle>إلغاء ربط ناظم</DialogTitle></DialogHeader>
      <p className="text-sm font-bold leading-7 text-muted-foreground">سيتم حذف بيانات دخول ناظم وروابط الطلاب والخطط الخاصة بالمعلم {teacher?.teacherName} من المنصة.</p>
      <DialogFooter>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>إلغاء</Button>
        <Button type="button" variant="destructive" className="min-h-11" disabled={busy} onClick={onConfirm}>{busy ? 'جاري الإلغاء...' : 'تأكيد'}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default NazemUnlinkDialog;
