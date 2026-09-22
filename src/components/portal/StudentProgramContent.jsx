import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, FileDown, Sparkles } from 'lucide-react';
import ProgramChoiceIndicator from '@/components/programs/ProgramChoiceIndicator';
import ProgramRichText from '@/components/programs/ProgramRichText';
import { Button } from '@/components/ui/button';
import { studentsApi } from '@/services/studentsApi';
import { useToast } from '@/components/ui/use-toast';
import useRewardUnits from '@/hooks/useRewardUnits';
import { hasProgramActivity } from '@/lib/programActivity';
import StudentProgramResult from '@/components/programs/StudentProgramResult';

export default function StudentProgramContent({ program, onCompleted }) {
  const rewardUnits = useRewardUnits();
  const { toast } = useToast();
  const [phase, setPhase] = useState('content');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);

  useEffect(() => {
    setPhase('content'); setQuestionIndex(0); setAnswers({}); setResult(null); setSubmitting(false);
    submitLock.current = false;
  }, [program?.id]);

  const content = useMemo(() => program?.contents?.find(({ type }) => type === 'text'), [program]);
  const attachment = useMemo(() => program?.contents?.find(({ type }) => type !== 'text'), [program]);
  if (!program) return null;
  if (!hasProgramActivity(program)) return <section className="space-y-5 [font-family:var(--font-ui)]" dir="rtl"><h1 className="text-2xl font-black">{program.title}</h1><StudentProgramResult program={program} /></section>;

  const canAttempt = !program.completedAt || program.allowMultipleAttempts;
  const currentQuestion = (program.questions || [])[questionIndex];
  const selectedOptionId = currentQuestion ? Number(answers[currentQuestion.id] || 0) : 0;

  const submit = async () => {
    if (submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    try {
      const response = await studentsApi.submitProgram(program.id, answers);
      setResult(response);
      await onCompleted?.(response);
      setSubmitting(false);
    } catch (error) {
      toast({ title: 'تعذر إرسال الإجابات', description: error.message, variant: 'destructive' });
      setSubmitting(false);
      submitLock.current = false;
    }
  };

  const next = () => {
    if (!selectedOptionId) return;
    if (questionIndex < program.questions.length - 1) {
      setQuestionIndex((current) => current + 1);
      return;
    }
    submit();
  };

  const _resolveConditional = () => {
    if (submitting) {
      return 'جارٍ الإرسال...';
    }
    if (questionIndex < program.questions.length - 1) {
      return 'التالي';
    }
    return 'إنهاء الاختبار';
  };
  return (
    <section className="relative mx-auto max-w-2xl space-y-5 [font-family:var(--font-ui)]" dir="rtl">
      <h1 className="break-words text-2xl font-black">{program.title}</h1>
        {phase === 'content' ? (
          <div className="min-h-0 space-y-5 overflow-y-auto">
            <ProgramRichText className="rounded-2xl border border-primary/10 bg-primary/[0.05] p-4 text-sm font-semibold text-foreground sm:p-5 sm:text-base">
              {content?.value || ''}
            </ProgramRichText>
            {attachment && (
              <a
                href={attachment.value}
                download={attachment.fileName || 'ملف مرفق'}
                className="flex min-h-12 items-center gap-3 rounded-2xl border border-primary/20 bg-background px-4 font-black text-primary transition-colors hover:bg-primary/5"
              >
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10"><FileDown className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1 truncate">{attachment.fileName || 'تحميل الملف المرفق'}</span>
              </a>
            )}
            {program.completedAt && !canAttempt && (
              <p className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-700 dark:text-emerald-300">
                النتيجة: {rewardUnits.format(program.earnedPoints)}
              </p>
            )}
          </div>
        ) : (
          <div className="min-h-0 space-y-5 overflow-y-auto">
            <div className="flex items-center justify-between gap-3 text-xs font-black text-muted-foreground">
              <span>السؤال {questionIndex + 1}</span>
              <span>{questionIndex + 1} / {program.questions.length}</span>
            </div>
            <fieldset className="space-y-3">
              <legend className="mb-4 text-lg font-black leading-8 text-foreground">{currentQuestion?.text}</legend>
              {currentQuestion?.options.map((option) => {
                const selected = selectedOptionId === option.id;
                return (
                  <label key={option.id} className={`flex min-h-14 focus-within:ring-2 focus-within:ring-primary cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-bold transition-all sm:text-base ${selected ? 'border-primary/35 bg-primary/[0.06] shadow-sm' : 'border-primary/10 bg-background hover:border-primary/25'}`}>
                    <input className="sr-only" type="radio" name={`question-${currentQuestion.id}`} checked={selected} onChange={() => setAnswers({ ...answers, [currentQuestion.id]: option.id })} />
                    <ProgramChoiceIndicator selected={selected} />
                    <span>{option.text}</span>
                  </label>
                );
              })}
            </fieldset>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {!result && phase === 'content' && canAttempt && program.questions.length > 0 && (
            <Button className="min-h-11" onClick={() => setPhase('quiz')}>ابدأ</Button>
          )}
          {!result && phase === 'quiz' && (
            <Button className="min-h-11" disabled={!selectedOptionId || submitting} onClick={next}>
              {_resolveConditional()}
            </Button>
          )}
        </div>

        {result && (
          <output  className="grid place-items-center rounded-2xl bg-card p-5">
            <div className="w-full max-w-sm rounded-[2rem] border border-emerald-500/20 bg-card p-7 text-center shadow-[0_24px_70px_rgba(7,28,43,.18)]">
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/20">
                <CheckCircle2 className="h-8 w-8" />
              </span>
              <div className="mt-5 flex items-center justify-center gap-2 text-primary"><Sparkles className="h-4 w-4" /><span className="text-xs font-black">اكتمل البرنامج</span></div>
              <h3 className="mt-2 text-xl font-black text-foreground">تم الانتهاء من الاختبار!</h3>
              <p className="mt-3 text-lg font-black text-emerald-700 dark:text-emerald-300">النتيجة: {rewardUnits.format(result.earnedPoints)}</p>
            </div>
          </output>
        )}
    </section>
  );
}
