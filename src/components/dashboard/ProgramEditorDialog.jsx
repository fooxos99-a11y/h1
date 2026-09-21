import ProgramSectionsEditor from '@/components/programs/ProgramSectionsEditor';
import React, { useEffect, useId, useState } from 'react';
import { Paperclip, Plus, Trash2, X } from 'lucide-react';
import ProgramChoiceIndicator from '@/components/programs/ProgramChoiceIndicator';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SettingToggle from '@/components/ui/setting-toggle';
import { Textarea } from '@/components/ui/textarea';
import useRewardUnits from '@/hooks/useRewardUnits';

const emptyOption = () => ({ text: '', isCorrect: false });
const emptyQuestion = () => ({ text: '', options: [{ ...emptyOption(), isCorrect: true }, emptyOption()] });
const emptyDraft = () => ({
  sectionsEnabled: false,
  sections: [],
  manual: false,
  title: '',
  status: 'open',
  pointsReward: 0,
  allowMultipleAttempts: false,
  contentText: '',
  attachment: null,
  questions: [],
});

const fileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || '').replace(/^data:;base64,/, 'data:application/octet-stream;base64,'));
  reader.onerror = () => reject(new Error('تعذرت قراءة الملف.'));
  reader.readAsDataURL(file);
});

export default function ProgramEditorDialog({ open, program, saving, onOpenChange, onSave, sectionMode = false }) {
  const rewardUnits = useRewardUnits();
  const fieldId = useId();
  const [draft, setDraft] = useState(emptyDraft);
  const [fileError, setFileError] = useState('');

  useEffect(() => {
    if (!open) return;
    if (!program) {
      setDraft(emptyDraft());
    } else {
      const textContent = program.contents.find(({ type }) => type === 'text');
      const attachment = program.contents.find(({ type }) => type !== 'text');
      setDraft({
        sectionsEnabled: Boolean(program.sectionsEnabled),
        sections: program.sections || [],
        manual: !program.questions.length,
        title: program.title,
        status: program.status,
        pointsReward: program.pointsReward,
        allowMultipleAttempts: Boolean(program.allowMultipleAttempts),
        contentText: textContent?.value || '',
        attachment: attachment ? {
          type: 'file',
          value: attachment.value,
          fileName: attachment.fileName || 'ملف مرفق',
          mimeType: attachment.mimeType || 'application/octet-stream',
        } : null,
        questions: program.questions.map((question) => ({
          text: question.text,
          options: question.options.map(({ text, isCorrect }) => ({ text, isCorrect })),
        })),
      });
    }
    setFileError('');
  }, [open, program]);

  const readFile = async (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setFileError('حجم الملف يجب ألا يتجاوز 10 ميجابايت.');
      return;
    }
    setFileError('');
    const value = await fileAsDataUrl(file);
    setDraft((current) => ({
      ...current,
      attachment: {
        type: 'file',
        value,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
      },
    }));
  };

  const updateQuestion = (index, patch) => setDraft((current) => ({
    ...current,
    questions: current.questions.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
  }));
  const updateOption = (questionIndex, optionIndex, patch) => {
    const question = draft.questions[questionIndex];
    updateQuestion(questionIndex, {
      options: question.options.map((item, index) => index === optionIndex ? { ...item, ...patch } : item),
    });
  };
  const chooseCorrect = (questionIndex, optionIndex) => updateQuestion(questionIndex, {
    options: draft.questions[questionIndex].options.map((item, index) => ({ ...item, isCorrect: index === optionIndex })),
  });
  const submit = () => onSave({
    sectionsEnabled: !sectionMode && draft.sectionsEnabled,
    sections: !sectionMode && draft.sectionsEnabled ? draft.sections : [],
    title: draft.title,
    status: draft.status,
    pointsReward: draft.pointsReward,
    allowMultipleAttempts: !draft.manual && draft.allowMultipleAttempts,
    contents: [
      ...(draft.contentText.trim() ? [{ type: 'text', value: draft.contentText.trim() }] : []),
      ...(draft.attachment ? [draft.attachment] : []),
    ],
    questions: draft.manual ? [] : draft.questions,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto [font-family:var(--font-ui)]" dir="rtl">
        <DialogHeader><DialogTitle>{sectionMode ? (program ? 'تعديل القسم' : 'إضافة قسم') : (program ? 'تعديل البرنامج' : 'إضافة برنامج')}</DialogTitle></DialogHeader>
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label htmlFor={`${fieldId}-program-title`}>{sectionMode ? 'اسم القسم' : 'اسم البرنامج'}</Label>
              <Input id={`${fieldId}-program-title`} className="mt-1 h-11" value={draft.title} maxLength={180} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            </div>
            <div>
              <Label htmlFor={`${fieldId}-program-points`}>{rewardUnits.text('عدد الكيلومترات')}</Label>
              <Input id={`${fieldId}-program-points`} className="mt-1 h-11" type="number" min="0" max="10000" disabled={draft.sectionsEnabled} value={draft.sectionsEnabled ? draft.sections.reduce((sum, section) => sum + Number(section.pointsReward || 0), 0) : draft.pointsReward} onChange={(event) => setDraft({ ...draft, pointsReward: Number(event.target.value || 0) })} />
            </div>
          </div>

          {!sectionMode && <SettingToggle label="أقسام البرنامج" checked={draft.sectionsEnabled} onCheckedChange={sectionsEnabled => setDraft({ ...draft, sectionsEnabled })} />}
          {draft.sectionsEnabled && !sectionMode ? <ProgramSectionsEditor sections={draft.sections} onChange={sections => setDraft({ ...draft, sections })} /> : <>
          <section className="space-y-3">
            <Label htmlFor={`${fieldId}-program-content`}>النص (اختياري)</Label>
            <Textarea
              id={`${fieldId}-program-content`}
              className="min-h-40 leading-7"
              maxLength={20000}
              value={draft.contentText}
              onChange={(event) => setDraft({ ...draft, contentText: event.target.value })}
            />
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-primary/20 bg-background px-4 text-sm font-black text-primary transition-colors hover:bg-primary/5">
                <Paperclip className="h-4 w-4" />
                إرفاق ملف
                <input type="file" className="sr-only" onChange={(event) => readFile(event.target.files?.[0])} />
              </label>
              {draft.attachment && (
                <span className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-xl bg-muted/60 px-3 text-sm font-bold text-foreground">
                  <span className="truncate">{draft.attachment.fileName}</span>
                  <button type="button" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-destructive hover:bg-destructive/10" aria-label="حذف الملف" onClick={() => setDraft({ ...draft, attachment: null })}>
                    <X className="h-4 w-4" />
                  </button>
                </span>
              )}
            </div>
            {fileError && <p className="text-sm font-bold text-destructive">{fileError}</p>}
          </section>

          <SettingToggle label="بدون أسئلة — تسجيل النقاط يدويًا" checked={draft.manual} onCheckedChange={(manual) => setDraft({ ...draft, manual })} />
          {!draft.manual && <><SettingToggle
            label="السماح بأكثر من محاولة"
            disabled={sectionMode}
            checked={!sectionMode && draft.allowMultipleAttempts}
            onCheckedChange={(allowMultipleAttempts) => setDraft({ ...draft, allowMultipleAttempts })}
          />

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-black">الأسئلة</h3>
                {draft.questions.length > 0 && <p className="text-xs text-muted-foreground">{rewardUnits.text('تُوزع الكيلومترات تلقائيًا حسب الإجابات الصحيحة.')}</p>}
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => setDraft({ ...draft, questions: [...draft.questions, emptyQuestion()] })}>
                <Plus className="h-4 w-4" /> سؤال
              </Button>
            </div>
            {draft.questions.map((question, questionIndex) => (
              <div key={questionIndex} className="space-y-3 rounded-2xl border border-primary/15 bg-background/50 p-3 sm:p-4">
                <div className="flex gap-2">
                  <Input className="h-11 min-w-0 flex-1" placeholder={`السؤال ${questionIndex + 1}`} value={question.text} onChange={(event) => updateQuestion(questionIndex, { text: event.target.value })} />
                  <Button type="button" size="icon" variant="ghost" aria-label="حذف السؤال" onClick={() => setDraft({ ...draft, questions: draft.questions.filter((_, index) => index !== questionIndex) })}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                {question.options.map((option, optionIndex) => (
                  <div key={optionIndex} className="flex items-center gap-2">
                    <label className="grid min-h-11 cursor-pointer place-items-center px-1" title="تحديد الإجابة الصحيحة">
                      <input className="sr-only" aria-label="الإجابة الصحيحة" type="radio" name={`${fieldId}-correct-${questionIndex}`} checked={option.isCorrect} onChange={() => chooseCorrect(questionIndex, optionIndex)} />
                      <ProgramChoiceIndicator selected={option.isCorrect} />
                    </label>
                    <Input className="h-11 min-w-0 flex-1" placeholder={`الخيار ${optionIndex + 1}`} value={option.text} onChange={(event) => updateOption(questionIndex, optionIndex, { text: event.target.value })} />
                    {question.options.length > 2 && (
                      <Button type="button" size="icon" variant="ghost" aria-label="حذف الخيار" onClick={() => updateQuestion(questionIndex, { options: question.options.filter((_, index) => index !== optionIndex) })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                {question.options.length < 6 && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => updateQuestion(questionIndex, { options: [...question.options, emptyOption()] })}>
                    <Plus className="h-4 w-4" /> إضافة خيار
                  </Button>
                )}
              </div>
            ))}
          </section></>}
          </>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button type="button" disabled={saving || !draft.title.trim() || (draft.sectionsEnabled && !draft.sections.length)} onClick={submit}>{saving ? 'جارٍ الحفظ...' : 'حفظ'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
