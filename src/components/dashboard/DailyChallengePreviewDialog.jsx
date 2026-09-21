import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import DailyChallengeGamePicker from '@/components/dashboard/DailyChallengeGamePicker';
import StudentDailyChallengeSection from '@/components/portal/StudentDailyChallengeSection';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DAILY_CHALLENGE_GAMES, normalizeDailyChallengeGames } from '../../../shared/daily-challenge.js';

const DailyChallengePreviewDialog = ({
  open,
  onOpenChange,
  points = 0,
  selectedGames = [],
}) => {
  const [selectedGame, setSelectedGame] = useState('');
  const enabledGameTypes = normalizeDailyChallengeGames(selectedGames);
  const enabledGames = DAILY_CHALLENGE_GAMES.filter((game) => enabledGameTypes.includes(game.value));

  useEffect(() => {
    if (!open) setSelectedGame('');
  }, [open]);

  useEffect(() => {
    if (!open || !selectedGame) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open, selectedGame]);

  if (open && selectedGame) {
    return createPortal(
      <div className="fixed inset-0 z-[1000] h-dvh overflow-y-auto bg-[#001f2d] [font-family:var(--font-ui)]" dir="rtl">
        <StudentDailyChallengeSection
          key={selectedGame}
          previewGameType={selectedGame}
          previewPoints={points}
          onBack={() => setSelectedGame('')}
        />
      </div>,
      document.body,
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md [font-family:var(--font-ui)]" dir="rtl">
        <DialogHeader>
          <DialogTitle>اختر لعبة للتجربة</DialogTitle>
        </DialogHeader>
        <DailyChallengeGamePicker games={enabledGames} onSelect={setSelectedGame} />
      </DialogContent>
    </Dialog>
  );
};

export default DailyChallengePreviewDialog;
