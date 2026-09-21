import React, { useState } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { useToast } from '@/components/ui/use-toast';
import MessageTemplateField, { TemplateVariablesHint } from '@/components/dashboard/MessageTemplateField';
import { studentsApi } from '@/services/studentsApi';

const templateKeys = [
  'registrationPreAcceptTemplate',
  'registrationAcceptTemplate',
  'registrationRejectTemplate',
];

const RegistrationTemplatesDialog = () => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleOpenChange = async (nextOpen) => {
    setOpen(nextOpen);
    if (!nextOpen) return;
    setIsLoading(true);
    try {
      setSettings(await studentsApi.getSettings());
    } catch (error) {
      setOpen(false);
      toast({ title: 'تعذر تحميل القوالب', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const updateTemplate = (key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const saveTemplates = async () => {
    if (!settings) return;
    setIsSaving(true);
    try {
      const saved = await studentsApi.updateSettings(settings);
      setSettings(saved);
      window.dispatchEvent(new CustomEvent('madarij-settings-updated', { detail: saved }));
      setOpen(false);
      toast({ title: 'حُفظت قوالب التسجيل' });
    } catch (error) {
      toast({ title: 'تعذر حفظ القوالب', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const hasAllTemplates = settings && templateKeys.every((key) => typeof settings[key] === 'string');

  return (
    <>
      <Button type="button" variant="outline" onClick={() => handleOpenChange(true)} className="h-11 gap-2">
        <FileText className="h-4 w-4" />
        القوالب
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-2xl border-primary/30 bg-card text-foreground [font-family:var(--font-ui)]" dir="rtl">
          <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <DialogTitle className="text-primary">قوالب التسجيل</DialogTitle>
            <TemplateVariablesHint />
          </DialogHeader>
          {isLoading || !hasAllTemplates ? (
            <div className="grid min-h-48 place-items-center"><LoadingSpinner /></div>
          ) : (
            <div className="space-y-5">
              <MessageTemplateField
                id="registration-pre-accept-template"
                label="قالب القبول المبدئي"
                value={settings.registrationPreAcceptTemplate}
                onChange={(value) => updateTemplate('registrationPreAcceptTemplate', value)}
              />
              <MessageTemplateField
                id="registration-accept-template"
                label="قالب القبول النهائي"
                value={settings.registrationAcceptTemplate}
                onChange={(value) => updateTemplate('registrationAcceptTemplate', value)}
              />
              <MessageTemplateField
                id="registration-reject-template"
                label="قالب الرفض"
                value={settings.registrationRejectTemplate}
                onChange={(value) => updateTemplate('registrationRejectTemplate', value)}
              />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button type="button" onClick={saveTemplates} disabled={!hasAllTemplates || isSaving}>
              {isSaving ? <LoadingSpinner /> : 'حفظ القوالب'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default RegistrationTemplatesDialog;
