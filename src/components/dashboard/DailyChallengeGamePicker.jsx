import React from 'react';
import { Brain, Calculator, Flashlight, Palette, Ruler, Trees } from 'lucide-react';
import { Button } from '@/components/ui/button';

const GAME_META = Object.freeze({
  size_ordering: { icon: Ruler, hint: 'رتّب الأشكال من الأكبر إلى الأصغر' },
  color_difference: { icon: Palette, hint: 'اكتشف المربع المختلف في اللون' },
  math_problems: { icon: Calculator, hint: 'حل ثلاث مسائل قصيرة' },
  instant_memory: { icon: Brain, hint: 'احفظ ترتيب الأشكال ثم أعده' },
  summit_forest: { icon: Trees, hint: 'اعبر متاهة متجددة دون لمس الأشجار' },
  summit_cave: { icon: Flashlight, hint: 'احفظ تسلسل أضواء الكهف' },
});

const DailyChallengeGamePicker = ({ games, onSelect }) => (
  <div className="grid max-h-[70dvh] gap-2 overflow-y-auto overscroll-contain pe-1 [font-family:var(--font-ui)] touch-pan-y [-webkit-overflow-scrolling:touch]">
    {games.map((game) => {
      const meta = GAME_META[game.value] || { icon: Brain, hint: '' };
      const Icon = meta.icon;
      return (
        <Button
          key={game.value}
          type="button"
          variant="ghost"
          className="h-auto min-h-16 w-full justify-start gap-3 rounded-xl border border-primary/20 bg-card px-4 py-3 text-start hover:bg-primary/10"
          onClick={() => onSelect(game.value)}
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
          <span className="min-w-0"><b className="block truncate text-sm font-black">{game.label}</b><small className="mt-1 block whitespace-normal text-xs font-semibold text-muted-foreground">{meta.hint}</small></span>
        </Button>
      );
    })}
  </div>
);

export default DailyChallengeGamePicker;
