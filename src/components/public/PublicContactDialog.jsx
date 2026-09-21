import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { studentsApi } from '@/services/studentsApi';

const PublicContactDialog = ({ open, onOpenChange, hasSession = false, accountName = '' }) => {
  const { toast } = useToast();
  const [name, setName] = useState(accountName);
  const [subject, setSubject] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setName(accountName);
  }, [accountName, open]);

  const submit = async () => {
    if ((!hasSession && name.trim().length < 2) || subject.trim().length < 5) {
      toast({ title: 'أكمل البيانات', description: 'أدخل الاسم وموضوع الرسالة بشكل واضح.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await studentsApi.submitContactMessage({ name, subject });
      toast({ title: 'وصلت رسالتك إلى المجمع' });
      setSubject('');
      onOpenChange(false);
    } catch (error) {
      toast({ title: 'تعذر إرسال الرسالة', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-primary/25 bg-card text-foreground [font-family:var(--font-ui)]" dir="rtl">
        <DialogHeader>
          <DialogTitle>التواصل مع المجمع</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="public-contact-name">الاسم</Label>
            <Input
              id="public-contact-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              readOnly={hasSession}
              aria-readonly={hasSession}
              autoComplete="name"
              maxLength={180}
              className={hasSession ? 'cursor-not-allowed bg-muted/60' : ''}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="public-contact-subject">موضوع الرسالة</Label>
            <Textarea
              id="public-contact-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              maxLength={5000}
              rows={6}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>إلغاء</Button>
          <Button type="button" onClick={submit} loading={saving}>إرسال</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PublicContactDialog;
