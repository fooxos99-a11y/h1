import React, { useEffect, useState } from 'react';
import { ArrowLeft, Gavel, Grid3X3, ImageIcon, PackageOpen } from 'lucide-react';
import { Link } from '@/lib/router';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import LetterHiveQuestionBank from '@/components/games/letter-hive/LetterHiveQuestionBank';
import {
  addQuestionToBank,
  deleteQuestionFromBank,
  loadQuestionBank,
  loadSharedQuestionBank,
  saveSharedQuestionBank,
  updateQuestionInBank,
} from '@/components/games/letter-hive/letterHiveStorage';
import '@/components/games/letter-hive/letterHive.css';

const gameCards = [
  { title: 'خلية الحروف', to: '/letter-hive', icon: PackageOpen, hasBank: true },
  { title: 'لعبة الفئات', to: '/categories-game', icon: Grid3X3 },
  { title: 'لعبة المزاد', to: '/auction-game', icon: Gavel },
  { title: 'خمن الصورة', to: '/guess-image-game', icon: ImageIcon },
];

const CulturalCompetitionSection = ({ canManageBank = false }) => {
  const { toast } = useToast();
  const [questions, setQuestions] = useState(loadQuestionBank);
  const [showQuestionBank, setShowQuestionBank] = useState(false);

  useEffect(() => {
    let active = true;
    loadSharedQuestionBank().then((bank) => {
      if (active) setQuestions(bank);
    }).catch((error) => {
      toast({ title: 'تعذر تحميل بنك الأسئلة', description: error.message, variant: 'destructive' });
    });
    return () => { active = false; };
  }, [toast]);

  const updateQuestionBank = (updater) => {
    setQuestions((current) => {
      const next = updater(current);
      void saveSharedQuestionBank(next).catch((error) => {
        toast({ title: 'تعذر حفظ بنك الأسئلة', description: error.message, variant: 'destructive' });
      });
      return next;
    });
  };

  return (
    <div className="[font-family:var(--font-ui)]" dir="rtl">
      <div className="grid gap-4 sm:grid-cols-2">
        {gameCards.map(({ title, to, icon: Icon, hasBank }) => (
          <article key={to} className="flex min-w-0 flex-col justify-between gap-5 rounded-3xl border border-primary/25 bg-card/90 p-5 shadow-[0_18px_50px_hsl(var(--primary)/0.12)] backdrop-blur-xl">
            <div className="flex min-w-0 items-center gap-4">
              <button
                type="button"
                onClick={hasBank && canManageBank ? () => setShowQuestionBank(true) : undefined}
                disabled={!hasBank || !canManageBank}
                className="flex min-h-12 min-w-12 shrink-0 items-center justify-center text-[#d7a43b] transition-transform enabled:hover:scale-110 enabled:focus-visible:outline-none enabled:focus-visible:ring-2 enabled:focus-visible:ring-[#d7a43b]/60 disabled:cursor-default"
                aria-label={hasBank && canManageBank ? 'إدارة بنك أسئلة خلية الحروف' : title}
              >
                <Icon className="h-8 w-8" />
              </button>
              <h2 className="truncate text-xl font-black text-foreground sm:text-2xl">{title}</h2>
            </div>
            <Button asChild size="lg" className="min-h-12 w-full gap-2 rounded-2xl bg-primary font-black !text-white shadow-[0_10px_24px_hsl(var(--primary)/0.22)] hover:bg-primary/90 hover:!text-white">
              <Link to={to}>
                الدخول
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
          </article>
        ))}
      </div>

      {showQuestionBank ? (
        <LetterHiveQuestionBank
          questions={questions}
          onAdd={(payload) => updateQuestionBank((current) => addQuestionToBank(current, payload))}
          onUpdate={(id, payload) => updateQuestionBank((current) => updateQuestionInBank(current, id, payload))}
          onDelete={(id) => updateQuestionBank((current) => deleteQuestionFromBank(current, id))}
          onClose={() => setShowQuestionBank(false)}
        />
      ) : null}
    </div>
  );
};

export default CulturalCompetitionSection;
