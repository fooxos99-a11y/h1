import React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const NazemIdentityConfirmDialog = ({ account, busy, onOpenChange, onConfirm }) => (
  <Dialog open={Boolean(account)} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-md [font-family:var(--font-ui)]" dir="rtl">
      <DialogHeader><DialogTitle>اعتماد هوية حساب ناظم</DialogTitle></DialogHeader>
      <div className="space-y-3 text-sm font-bold">
        {account?.lastErrorCode === 'NAZEM_ACCOUNT_IDENTITY_CHANGED' && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive" role="alert">
            اعتماد الحساب الجديد سيغلق روابط الطلاب والخطط والتسميع السابقة لهذا المعلم، ثم يعيد اكتشافها من الحساب المعروض.
          </div>
        )}
        <div className="rounded-xl border bg-card p-3">
          <div className="text-xs text-muted-foreground">المعلم في المنصة</div>
          <div className="mt-1 font-black text-foreground">{account?.teacherName || '—'}</div>
        </div>
        <div className="rounded-xl border border-amber-400/40 bg-amber-500/5 p-3">
          <div className="text-xs text-muted-foreground">الحساب الظاهر في ناظم</div>
          <div className="mt-1 font-black text-foreground">{account?.externalTeacherName || '—'}</div>
          <div className="mt-1 text-xs text-muted-foreground">{account?.externalOrganizationName || 'بدون جهة ظاهرة'}</div>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>إلغاء</Button>
        <Button type="button" className="min-h-11" disabled={busy} onClick={() => onConfirm(account)}>
          {busy ? 'جاري الاعتماد...' : 'اعتماد الهوية المعروضة'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default NazemIdentityConfirmDialog;
