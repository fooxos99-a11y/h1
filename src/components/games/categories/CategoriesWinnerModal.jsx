import React from 'react';
import WinEffects from '@/components/games/shared/WinEffects';

const CategoriesWinnerModal = ({ winner, onRestart, onHome, showActions = true }) => {
  if (!winner) return null;

  return (
    <div className="categories-modal-backdrop">
      <WinEffects fullscreen />
      <div className="categories-modal categories-winner-modal">
        <div className="categories-modal-points">انتهت اللعبة</div>
        <div className="categories-modal-question">{winner === 'تعادل' ? 'النتيجة: تعادل' : `الفائز: ${winner}`}</div>
        {showActions ? <div className="categories-winner-actions">
          <button type="button" className="categories-primary-button" onClick={onRestart}>لعب مرة أخرى</button>
          <button type="button" className="categories-secondary-button" onClick={onHome}>العودة للرئيسية</button>
        </div> : null}
      </div>
    </div>
  );
};

export default CategoriesWinnerModal;
