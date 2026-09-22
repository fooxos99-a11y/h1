import React from 'react';
import { Eye, RefreshCw } from 'lucide-react';
import AuctionDialog from './AuctionDialog';
import QuestionTimer from '@/components/games/shared/QuestionTimer';

/** Render the existing controls with their accessible labels and responsive layout. */
export default function AuctionQuestionDialog({ isScreenMode, phase, question, isLoading, onChangeQuestion, bid, showAnswer, onShowAnswer, onFinishBid }) {
 return (!isScreenMode && phase === 'question' && question ? (
          <AuctionDialog onClose={() => {}}>
            <div className="auction-modal-title-row">
              <h2>{question.category}</h2>
              <button type="button" className="auction-change-question" disabled={isLoading} title="تغيير السؤال" onClick={onChangeQuestion}>
                <RefreshCw size={20} />
              </button>
            </div>
            <div className="auction-bid-chip">{bid.toLocaleString()}</div>
            <QuestionTimer resetKey={question.id} />
            <div className="auction-question">{question.question}</div>
            {showAnswer ? <div className="auction-answer">الإجابة: {question.answer}</div> : null}
            {!showAnswer ? (
              <button type="button" className="auction-primary-button w-full" onClick={onShowAnswer}>
                <Eye size={20} />
                إظهار الإجابة
              </button>
            ) : (
              <div className="auction-modal-actions">
                <button type="button" className="auction-primary-button" onClick={() => onFinishBid(true)}>
                  إجابة صحيحة (+{bid.toLocaleString()})
                </button>
                <button type="button" className="auction-danger-button" onClick={() => onFinishBid(false)}>
                  إجابة خاطئة (-{bid.toLocaleString()})
                </button>
              </div>
            )}
          </AuctionDialog>
        ) : null);
}
