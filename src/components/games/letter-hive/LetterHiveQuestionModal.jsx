import React from 'react';
import { RefreshCw } from 'lucide-react';
import QuestionTimer from '@/components/games/shared/QuestionTimer';
import GameDialog from '@/components/games/shared/GameDialog';

const LetterHiveQuestionModal = ({
  questionId,
  team1,
  team2,
  question,
  answer,
  showAnswer,
  onChangeQuestion,
  onClose,
  onShowAnswer,
  onAssign,
}) => (
  <GameDialog title={question} backdropClassName="letter-hive-modal-backdrop" className="letter-hive-modal" onClose={onClose}>
      <div className="letter-hive-modal-tools">
        <QuestionTimer resetKey={questionId || question} />
        <button type="button" className="letter-hive-change-question" onClick={onChangeQuestion} title="تغيير السؤال">
          <RefreshCw size={20} />
        </button>
      </div>
      <h3 className="letter-hive-question">{question}</h3>
      {!showAnswer && answer ? (
        <button type="button" onClick={onShowAnswer} className="letter-hive-dark-button">
          الإجابة
        </button>
      ) : null}
      {showAnswer && answer ? (
        <>
          <div className="letter-hive-answer">{answer}</div>
          <div className="letter-hive-team-actions">
            <button type="button" onClick={() => onAssign('red')} className="letter-hive-red-button">
              {team1}
            </button>
            <button type="button" onClick={() => onAssign('green')} className="letter-hive-green-button">
              {team2}
            </button>
          </div>
        </>
      ) : null}
  </GameDialog>
);

export default LetterHiveQuestionModal;
