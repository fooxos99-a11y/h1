import React from 'react';
import WinEffects from '@/components/games/shared/WinEffects';

const LetterHiveFinishOverlay = ({ message, onReset, onHome, showActions = true }) => (
  <div className="letter-hive-finish">
    <WinEffects fullscreen />
    <div className="letter-hive-finish-card">
      <div className="letter-hive-finish-title">انتهت اللعبة!</div>
      <div className="letter-hive-finish-message">{message}</div>
      {showActions ? (
        <div className="letter-hive-finish-actions">
          <button type="button" onClick={onReset}>لعب مرة أخرى</button>
          <button type="button" onClick={onHome}>العودة للرئيسية</button>
        </div>
      ) : null}
    </div>
  </div>
);

export default LetterHiveFinishOverlay;
