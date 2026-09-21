import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const NazemAccountLinkDialog = ({ open, teacher, busy, onOpenChange, onSubmit }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (!open) {
      setUsername('');
      setPassword('');
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md [font-family:var(--font-ui)]" dir="rtl">
        <DialogHeader><DialogTitle>ربط {teacher?.teacherName || 'المعلم'} بناظم</DialogTitle></DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({ username: username.trim(), password });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="nazem-username">اسم المستخدم في ناظم</Label>
            <Input id="nazem-username" className="min-h-11" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="off" dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nazem-password">كلمة المرور في ناظم</Label>
            <Input id="nazem-password" className="min-h-11" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" dir="ltr" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button type="submit" className="min-h-11" disabled={busy || !username.trim() || !password}>{busy ? 'جاري الربط...' : 'ربط'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default NazemAccountLinkDialog;
