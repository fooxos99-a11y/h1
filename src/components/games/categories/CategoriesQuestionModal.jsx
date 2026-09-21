import React from 'react';
import { RefreshCw } from 'lucide-react';
import QuestionTimer from '@/components/games/shared/QuestionTimer';
import useRewardUnits from '@/hooks/useRewardUnits';

const CategoriesQuestionModal = ({
  activeQuestion,
  showAnswer,
  teamNames,
  onChangeQuestion,
  onShowAnswer,
  onFinish,
}) => {
  const rewardUnits = useRewardUnits();
  if (!activeQuestion) return null;

  return (
    <div className="categories-modal-backdrop">
      <div className="categories-modal">
        <div className="categories-modal-tools">
          <QuestionTimer resetKey={activeQuestion.id} />
          <button type="button" className="categories-change-question" onClick={onChangeQuestion} title="تغيير السؤال">
            <RefreshCw size={20} />
          </button>
        </div>
        <div className="categories-modal-points">{rewardUnits.format(activeQuestion.points)}</div>
        <div className="categories-modal-question">{activeQuestion.question}</div>
        {showAnswer ? <div className="categories-modal-answer">{activeQuestion.answer}</div> : null}
        {!showAnswer ? (
          <button type="button" className="categories-primary-button w-full" onClick={onShowAnswer}>إظهار الإجابة</button>
        ) : (
          <div className="categories-modal-actions">
            <button type="button" className="categories-primary-button" onClick={() => onFinish(0)}>{teamNames[0]}</button>
            <button type="button" className="categories-primary-button" onClick={() => onFinish(1)}>{teamNames[1]}</button>
            <button type="button" className="categories-secondary-button" onClick={() => onFinish(null)}>لم يجب أحد</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CategoriesQuestionModal;
