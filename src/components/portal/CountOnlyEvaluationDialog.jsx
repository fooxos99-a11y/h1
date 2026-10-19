import React, { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ErrorState from '@/components/ui/error-state';
import { withinTimeout } from '@/lib/asyncRecovery';
import { getRecitationDraft, saveRecitationDraft } from '@/services/offlineRecitationService';

const normalizeCount = (value) => Math.min(1000, Math.max(0, Math.trunc(Number(value) || 0)));
const EMPTY_ITEMS = Object.freeze([]);

const CountField = ({ id, label, value, onChange }) => (
  <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <div className="grid grid-cols-[2.75rem_3rem_2.75rem] justify-start gap-1" dir="ltr">
      <Button type="button" variant="outline" size="icon" className="h-11 w-11 touch-manipulation" aria-label={`إنقاص ${label}`} onClick={() => onChange(normalizeCount(value - 1))}>
        <Minus className="h-4 w-4" />
      </Button>
      <Input id={id} aria-label={label} type="number" min="0" max="1000" inputMode="numeric" className="h-11 px-1 text-center font-black tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" value={value} onChange={(event) => onChange(normalizeCount(event.target.value))} />
      <Button type="button" variant="outline" size="icon" className="h-11 w-11 touch-manipulation" aria-label={`زيادة ${label}`} onClick={() => onChange(normalizeCount(value + 1))}>
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  </div>
);

const CountOnlyEvaluationDialog = ({
  open,
  onOpenChange,
  title = 'تسجيل نتيجة التسميع',
  showItemLabels = true,
  initialWarningCount = 0,
  initialMistakeCount = 0,
  onSubmit,
  secondaryAction = null,
  isSaving = false,
  submitLabel = 'إنهاء',
  children,
  items = EMPTY_ITEMS,
  supervisorId,
  studentId,
}) => {
  const [warningCount, setWarningCount] = useState(0);
  const [mistakeCount, setMistakeCount] = useState(0);
  const [itemCounts, setItemCounts] = useState({});
  const [draftReady, setDraftReady] = useState(false);
  const [draftError, setDraftError] = useState('');
  const [draftRevision, setDraftRevision] = useState(0);
  const [draftWriteFailed, setDraftWriteFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setWarningCount(normalizeCount(initialWarningCount));
    setMistakeCount(normalizeCount(initialMistakeCount));
    setDraftReady(false);
    setDraftError('');
    setDraftWriteFailed(false);
    const defaults = Object.fromEntries(items.map((item) => [String(item.id), {
      warningCount: normalizeCount(item.warningCount),
      mistakeCount: normalizeCount(item.mistakeCount),
    }]));
    let active = true;
    void (async () => {
      const draft = supervisorId && studentId
        ? await withinTimeout(() => getRecitationDraft(supervisorId, studentId), 5_000, 'تعذر قراءة نتيجة التسميع المحفوظة. أعد المحاولة.') : null;
      if (!active) return;
      if (draft?.mode === 'count' && (!draft.itemCounts || typeof draft.itemCounts !== 'object' || Array.isArray(draft.itemCounts))) {
        throw new Error('تعذر قراءة نتيجة التسميع المحفوظة. أعد المحاولة.');
      }
      setItemCounts(Object.fromEntries(items.map(item => {
        const saved = draft?.mode === 'count' && draft.itemCounts[String(item.id)];
        if (!saved) return [String(item.id), defaults[String(item.id)]];
        if (![saved.warningCount, saved.mistakeCount].every(value => Number.isInteger(value) && value >= 0 && value <= 1000)) {
          throw new Error('تعذر قراءة نتيجة التسميع المحفوظة. أعد المحاولة.');
        }
        return [String(item.id), { warningCount: saved.warningCount, mistakeCount: saved.mistakeCount }];
      })));
      setDraftReady(true);
    })().catch(() => { if (active) setDraftError('تعذر قراءة نتيجة التسميع المحفوظة. أعد المحاولة.'); });
    return () => { active = false; };
  }, [draftRevision, initialMistakeCount, initialWarningCount, items, open, studentId, supervisorId]);

  useEffect(() => {
    if (!open || !draftReady || !supervisorId || !studentId) return undefined;
    let active = true;
    const timer = window.setTimeout(() => {
      void saveRecitationDraft(supervisorId, studentId, { mode: 'count', itemCounts })
        .catch(() => { if (active) { setDraftReady(false); setDraftWriteFailed(true); setDraftError('تعذر حفظ نتيجة التسميع على الجهاز. أعد المحاولة.'); } });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [draftReady, itemCounts, open, studentId, supervisorId]);

  const updateItemCount = (itemId, field, value) => setItemCounts((current) => ({
    ...current,
    [String(itemId)]: { ...current[String(itemId)], [field]: normalizeCount(value) },
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border-primary/30 bg-card [font-family:var(--font-ui)]" dir="rtl">
        <DialogHeader><DialogTitle className="text-right text-primary neon-text">{title}</DialogTitle></DialogHeader>
        {children}
        {draftError && <ErrorState message={draftError} onRetry={async () => {
          if (!draftWriteFailed) { setDraftRevision(value => value + 1); return; }
          try {
            await withinTimeout(() => saveRecitationDraft(supervisorId, studentId, { mode: 'count', itemCounts }), 5_000, draftError);
            setDraftWriteFailed(false); setDraftError(''); setDraftReady(true);
          } catch { setDraftError('تعذر حفظ نتيجة التسميع على الجهاز. أعد المحاولة.'); }
        }} />}
        <fieldset disabled={!draftReady || isSaving} className="contents">
        {items.length ? (
          <div className="max-h-[65dvh] space-y-3 overflow-y-auto pr-1">
            {items.map((item, index) => {
              const counts = itemCounts[String(item.id)] || { warningCount: 0, mistakeCount: 0 };
              return (
                <section key={item.id} className="space-y-3 rounded-xl border border-primary/15 bg-background/60 p-3">
                  {showItemLabels && items.length > 1 && <div className="text-sm font-black text-foreground">{item.label || `المقطع ${index + 1}`}</div>}
                  <div className="grid grid-cols-1 gap-4 min-[390px]:grid-cols-2">
                    <CountField id={`recitation-warning-count-${item.id}`} label="عدد التنبيهات" value={counts.warningCount} onChange={(value) => updateItemCount(item.id, 'warningCount', value)} />
                    <CountField id={`recitation-mistake-count-${item.id}`} label="عدد الأخطاء" value={counts.mistakeCount} onChange={(value) => updateItemCount(item.id, 'mistakeCount', value)} />
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 min-[390px]:grid-cols-2">
            <CountField id="recitation-warning-count" label="عدد التنبيهات" value={warningCount} onChange={setWarningCount} />
            <CountField id="recitation-mistake-count" label="عدد الأخطاء" value={mistakeCount} onChange={setMistakeCount} />
          </div>
        )}
        </fieldset>
        <DialogFooter className="!flex-row !justify-between gap-2" dir="rtl">
          <Button type="button" variant="outline" className="min-h-11 px-3" onClick={() => onOpenChange?.(false)} disabled={isSaving}>إغلاق</Button>
          <div className="flex items-center gap-2">
            {secondaryAction && React.cloneElement(secondaryAction, { disabled: isSaving || !draftReady })}
            <Button type="button" className="min-h-11 px-3 text-white hover:text-white" onClick={() => onSubmit?.({ warningCount, mistakeCount, itemCounts })} disabled={isSaving || !draftReady}>{submitLabel}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CountOnlyEvaluationDialog;
