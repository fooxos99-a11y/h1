import React, { useEffect, useState } from 'react';
import { Clock3, RotateCcw } from 'lucide-react';
import CaveMemoryGame from '@/components/summit/games/CaveMemoryGame';
import ForestMazeGame from '@/components/summit/ForestMazeGame';
import { Button } from '@/components/ui/button';
import './summitMiniGames.css';

const GAME_COMPONENTS = Object.freeze({
  forest: ForestMazeGame,
  cave: CaveMemoryGame,
});

const SummitMiniGame = ({ attempt, onSubmit, isSubmitting, showRestart = true, showTimer = true, title = '' }) => {
  const { stage, challenge } = attempt;
  const [seconds, setSeconds] = useState(stage.duration);
  const GameComponent = GAME_COMPONENTS[challenge.type];

  useEffect(() => {
    if (!showTimer) return undefined;
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [showTimer]);

  if (!GameComponent) return null;

  return (
    <div className="space-y-4 text-white [font-family:var(--font-ui)]" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold text-amber-300">{stage.points.toLocaleString('ar-SA-u-nu-latn')} كم</div>
          <h2 className="text-xl font-black sm:text-2xl">{title || stage.challenge}</h2>
        </div>
        {showTimer ? (
          <div className={`flex items-center gap-1 rounded-xl px-3 py-2 font-black ${seconds <= 10 ? 'bg-red-500/25 text-red-200' : 'bg-white/10'}`} dir="ltr">
            <Clock3 className="h-4 w-4" />{seconds}
          </div>
        ) : null}
      </div>
      <GameComponent challenge={challenge} isSubmitting={isSubmitting} onComplete={onSubmit} />
      {showRestart ? (
        <Button variant="ghost" className="min-h-11 text-white/65 hover:text-white" onClick={() => window.location.reload()}>
          <RotateCcw className="ms-2 h-4 w-4" />إعادة المحاولة
        </Button>
      ) : null}
    </div>
  );
};

export default SummitMiniGame;
