import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import './gameIntro.css';

const INTRO_DURATION = 450;

export const useGameIntro = (showOnMount = true) => {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  const playIntro = useCallback(() => new Promise((resolve) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(true);
    timerRef.current = setTimeout(() => {
      setVisible(false);
      timerRef.current = null;
      resolve();
    }, INTRO_DURATION);
  }), []);

  useEffect(() => {
    if (showOnMount) void playIntro();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [playIntro, showOnMount]);

  return { introVisible: visible, playIntro };
};

const GameIntroOverlay = ({ visible, title = 'استعد للتحدي' }) => {
  if (!visible) return null;

  return (
    <div className="game-intro-overlay" role="status" aria-live="polite">
      <div className="game-intro-card">
        <div className="game-intro-icon">
          <Sparkles size={34} />
        </div>
        <div className="game-intro-title">{title}</div>
        <div className="game-intro-loader" />
      </div>
    </div>
  );
};

export default GameIntroOverlay;
