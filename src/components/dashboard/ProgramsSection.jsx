import ProgramGradesDialog from '@/components/programs/ProgramGradesDialog';
import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import DashboardHeaderToggle from '@/components/dashboard/DashboardHeaderToggle';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import DashboardMobileHeaderActions from '@/components/dashboard/DashboardMobileHeaderActions';
import ProgramEditorDialog from '@/components/dashboard/ProgramEditorDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { studentsApi } from '@/services/studentsApi';

export default function ProgramsSection() {
  const { toast } = useToast();
  const [programs, setPrograms] = useState([]);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [configurationSaving, setConfigurationSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [grading, setGrading] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    try {
      const configuration = await studentsApi.getProgramsConfiguration();
      setEnabled(configuration.learningPathsEnabled);
      if (!configuration.learningPathsEnabled) {
        setPrograms([]);
        return;
      }
      setPrograms((await studentsApi.getPrograms()).programs || []);
    } catch (error) {
      toast({ title: 'تعذر تحميل البرامج', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const updateEnabled = async (learningPathsEnabled) => {
    setConfigurationSaving(true);
    try {
      const configuration = await studentsApi.updateProgramsConfiguration({ learningPathsEnabled });
      setEnabled(configuration.learningPathsEnabled);
      if (configuration.learningPathsEnabled) {
        setPrograms((await studentsApi.getPrograms()).programs || []);
      } else {
        setPrograms([]);
      }
    } catch (error) {
      toast({ title: 'تعذر حفظ إعداد البرامج', description: error.message, variant: 'destructive' });
    } finally {
      setConfigurationSaving(false);
    }
  };

  const save = async (payload) => {
    setSaving(true);
    try {
      if (editing) await studentsApi.updateProgram(editing.id, payload);
      else await studentsApi.createProgram(payload);
      await load();
      setEditorOpen(false);
      toast({ title: editing ? 'حُفظت التعديلات' : 'أُضيف المستوى' });
    } catch (error) {
      toast({ title: 'تعذر الحفظ', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (program) => {
    try {
      await studentsApi.updateProgram(program.id, { ...program, status: program.status === 'open' ? 'locked' : 'open' });
      await load();
    } catch (error) {
      toast({ title: 'تعذر تغيير حالة المستوى', description: error.message, variant: 'destructive' });
    }
  };

  const remove = async () => {
    try {
      await studentsApi.deleteProgram(deleting.id);
      setDeleting(null);
      await load();
      toast({ title: 'حُذف المستوى' });
    } catch (error) {
      toast({ title: 'تعذر الحذف', description: error.message, variant: 'destructive' });
    }
  };

  if (loading) return <DashboardLoader />;

  return (
    <section className="space-y-5 [font-family:var(--font-ui)]" dir="rtl">
      <DashboardMobileHeaderActions>
        <div className="flex min-w-0 items-center gap-1 sm:gap-2" dir="rtl">
          <DashboardHeaderToggle
            label="تفعيل البرامج"
            checked={enabled}
            disabled={configurationSaving}
            onCheckedChange={updateEnabled}
          />
          {enabled && (
            <Button
              className="h-11 w-11 gap-2 px-0 sm:w-auto sm:px-3"
              onClick={() => { setEditing(null); setEditorOpen(true); }}
              aria-label="إضافة مستوى"
              title="إضافة مستوى"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">إضافة مستوى</span>
            </Button>
          )}
        </div>
      </DashboardMobileHeaderActions>

      {enabled && (programs.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground"><BookOpen className="mx-auto mb-3 h-10 w-10" /><p>لا توجد مستويات بعد.</p></CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {programs.map((program) => (
            <Card key={program.id} className={`group overflow-hidden rounded-2xl border-primary/15 transition-all hover:-translate-y-0.5 hover:shadow-lg ${program.status === 'locked' ? 'opacity-75' : ''}`}>
              <CardContent className="space-y-5 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="min-w-0 break-words text-xl font-black text-foreground">{program.title}</h2>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/10">
                    <BookOpen className="h-5 w-5" />
                  </span>
                </div>
                {!program.sectionsEnabled && !program.questions.length && <Button className="min-h-11 w-full" onClick={() => setGrading(program)}>تسجيل النقاط</Button>}
                {program.sections?.filter(section => !section.questions.length).map(section => <Button key={section.id} variant="outline" className="min-h-11 w-full" onClick={() => setGrading(section)}>تسجيل النقاط: {section.title}</Button>)}
                <div className="flex gap-2">
                  <Button className="min-h-11 flex-1" variant="outline" onClick={() => { setEditing(program); setEditorOpen(true); }}>
                    <Pencil className="h-4 w-4" /> تعديل
                  </Button>
                  <Button className="min-h-11" size="icon" variant="outline" aria-label={program.status === 'open' ? 'إخفاء' : 'إظهار'} title={program.status === 'open' ? 'إخفاء' : 'إظهار'} onClick={() => toggle(program)}>
                    {program.status === 'open' ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button className="min-h-11 border-destructive/20 text-destructive hover:bg-destructive/5" size="icon" variant="outline" aria-label="حذف" onClick={() => setDeleting(program)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ))}

      <ProgramGradesDialog program={grading} onClose={() => setGrading(null)} />
      <ProgramEditorDialog open={editorOpen} program={editing} saving={saving} onOpenChange={setEditorOpen} onSave={save} />
      <Dialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent dir="rtl" className="[font-family:var(--font-ui)]">
          <DialogHeader><DialogTitle>حذف المستوى</DialogTitle></DialogHeader>
          <p>هل تريد حذف «{deleting?.title}»؟</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={remove}>حذف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
