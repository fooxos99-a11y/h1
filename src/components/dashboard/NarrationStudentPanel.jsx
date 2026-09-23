import React, { useCallback, useMemo, useState } from 'react';
import { BookOpen, CheckCircle2, Play } from 'lucide-react';
import CountOnlyEvaluationDialog from '@/components/portal/CountOnlyEvaluationDialog';
import MushafRecitationDialog from '@/components/portal/MushafRecitationDialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { loadOfflineSnapshot } from '@/services/offlineOperationsService';
import { studentsApi } from '@/services/studentsApi';
import NarrationJuzParts from './NarrationJuzParts';
import { groupNarrationParts } from '@/lib/narrationParts';

const getAccountId = () => Number(localStorage.getItem('wajeh_supervisor_id') || 0);

const NarrationStudentPanel = ({ eventId, student, archived, onSavePart, onStart }) => {
  const juzGroups = useMemo(() => groupNarrationParts(student.parts), [student.parts]);
  const [open, setOpen] = useState(false);
  const [selectedPart, setSelectedPart] = useState(null);
  const [mushafPart, setMushafPart] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const evaluatedParts = useMemo(
    () => student.parts.filter((part) => part.score !== null && part.score !== undefined),
    [student.parts]
  );
  const overallScore = evaluatedParts.length === student.parts.length && student.parts.length
    ? evaluatedParts.reduce((sum, part) => sum + Number(part.score), 0) / student.parts.length
    : null;
  const evaluatorNames = useMemo(
    () => [...new Set(evaluatedParts.map((part) => part.evaluatorName).filter(Boolean))],
    [evaluatedParts]
  );

  const openEvaluation = () => {
    setOpen(true);
    if (!archived && student.status === 'pending') onStart(student.id);
  };
  const loadMushafPart = useCallback(
    (part) => loadOfflineSnapshot(
      getAccountId(),
      `narration:ayahs:${eventId}:${part.id}`,
      () => studentsApi.getNarrationPartAyahs(eventId, part.id),
    ),
    [eventId]
  );
  const saveCountPart = async ({ warningCount, mistakeCount }) => {
    if (!selectedPart) return;
    setIsSaving(true);
    try {
      await onSavePart(selectedPart.id, { evaluationMode: 'count', warningCount, mistakeCount });
      setSelectedPart(null);
    } catch (error) {
      return error;
    } finally {
      setIsSaving(false);
    }
  };
  const saveMushafPart = async (part, payload) => {
    const result = await onSavePart(part.id, { evaluationMode: 'mushaf', wordMarks: payload.wordMarks });
    return { ...result, teacherCompleted: true };
  };

  const _resolveNarrationStudentPanel = () => {
    if (student.status === 'completed') {
      return 'تم الانتهاء';
    }
    if (archived) {
      return 'عرض';
    }
    return 'بدء';
  };
  return (
    <>
      <article className="flex min-h-32 flex-col justify-between gap-4 rounded-xl border border-primary/15 bg-background/70 p-4 shadow-sm shadow-primary/5 transition hover:border-primary/35 hover:shadow-md sm:min-h-36">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-black text-foreground">{student.studentName}</h3>
            <p className="mt-1 truncate text-sm font-bold text-muted-foreground">{student.committeeName}</p>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <BookOpen className="h-5 w-5" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-bold text-muted-foreground">
            {juzGroups.length} جزء
          </div>
          <Button
            type="button"
            onClick={openEvaluation}
            className={`min-h-11 min-w-24 gap-2 touch-manipulation ${student.status === 'completed' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : ''}`}
          >
            {student.status === 'completed' ? <CheckCircle2 className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {_resolveNarrationStudentPanel()}
          </Button>
        </div>
      </article>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto bg-card p-3 sm:p-6" dir="rtl">
          <DialogHeader className="border-b border-primary/10 pb-4 text-right">
            <DialogTitle className="text-xl font-black sm:text-2xl">{student.studentName}</DialogTitle>
            <p className="text-sm font-bold text-muted-foreground">{student.committeeName} · {student.totalFaces} وجه</p>
          </DialogHeader>

          <NarrationJuzParts groups={juzGroups} archived={archived} onResult={setSelectedPart} onRecite={setMushafPart} />

          <div className="grid gap-3 border-t border-primary/15 pt-4 sm:grid-cols-2">
            <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
              <div className="text-xs font-black text-muted-foreground">التقييم الإجمالي</div>
              <div className="mt-1 text-2xl font-black text-primary">
                {overallScore === null ? 'لم يكتمل' : `${overallScore.toFixed(1)} من 100`}
              </div>
            </div>
            <div className="rounded-xl border border-primary/15 bg-background/60 p-4">
              <div className="text-xs font-black text-muted-foreground">أسماء المسمعين</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {evaluatorNames.length ? evaluatorNames.map((name) => (
                  <span key={name} className="rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-black text-foreground">{name}</span>
                )) : <span className="text-sm font-bold text-muted-foreground">لم يبدأ التقييم</span>}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CountOnlyEvaluationDialog
        open={Boolean(selectedPart)}
        onOpenChange={(nextOpen) => !nextOpen && setSelectedPart(null)}
        title={selectedPart?.rangeLabel || `الجزء ${selectedPart?.juzNumber || ''}`}
        initialWarningCount={selectedPart?.warningCount}
        initialMistakeCount={selectedPart?.mistakeCount}
        onSubmit={saveCountPart}
        isSaving={isSaving}
        submitLabel="حفظ"
      />
      <MushafRecitationDialog
        tasks={mushafPart ? [{ ...mushafPart, fromSurahName: mushafPart.rangeLabel || `الجزء ${mushafPart.juzNumber}` }] : []}
        open={Boolean(mushafPart)}
        onOpenChange={(nextOpen) => !nextOpen && setMushafPart(null)}
        loadTaskData={loadMushafPart}
        saveTaskResult={saveMushafPart}
        completionMessage="حُفظ تقييم مقطع السرد."
        onSaved={() => setMushafPart(null)}
      />
    </>
  );
};

export default NarrationStudentPanel;
