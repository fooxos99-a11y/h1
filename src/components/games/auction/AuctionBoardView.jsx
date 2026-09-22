import AuctionWinnerDialog from './AuctionWinnerDialog';
import AuctionQuestionDialog from './AuctionQuestionDialog';
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Gavel, Minus, Plus, RefreshCw, Trophy } from 'lucide-react';
import GameThemeToggle from '@/components/games/shared/GameThemeToggle';
import AuctionDialog from './AuctionDialog';
import useRewardUnits from '@/hooks/useRewardUnits';

const AuctionBoardView = ({
  teams,
  rankings,
  winner,
  winnerLabel,
  bid,
  question,
  showAnswer,
  isLoading,
  bidderIndex,
  phase,
  isWinner,
  onDrawQuestion,
  onChangeQuestion,
  onSelectBidder,
  onDecreaseBid,
  onIncreaseBid,
  onConfirmBid,
  onShowAnswer,
  onFinishBid,
  onUpdateScore,
  onEndGame,
  onReset,
  onHome,
  isScreenMode = false,
}) => {
  const rewardUnits = useRewardUnits();
  const [editingTeam, setEditingTeam] = useState(null);
  const [editScore, setEditScore] = useState('');

  const saveScore = () => {
    if (editingTeam !== null) onUpdateScore(editingTeam, editScore);
    setEditingTeam(null);
    setEditScore('');
  };

  return (
    <main className={`auction-game-page ${isScreenMode ? 'is-display-screen' : ''}`}>
      <Helmet><title>لعبة المزاد</title></Helmet>
      <div className="auction-game-bg" />
      <GameThemeToggle />
      <section className="auction-shell">
        <div className="auction-header-card">
          <h1>لعبة المزاد</h1>
          <p>زايد على السؤال الذي تثق بإجابته واحسم الجولة لصالح فريقك.</p>
        </div>

        <div className={`auction-teams-grid auction-teams-${Math.min(teams.length, 4)}`}>
          {teams.map((team, index) => (
            <button
              type="button"
              className="auction-team-card"
              disabled={isScreenMode}
              key={`${team.name}-${index}`}
              onClick={() => {
                setEditingTeam(index);
                setEditScore(String(team.score));
              }}
            >
              <h3>{team.name}</h3>
              <p>{team.score.toLocaleString()}</p>
            </button>
          ))}
        </div>

        {!isScreenMode ? <div className="auction-main-actions">
          <button type="button" className="auction-primary-button" disabled={isLoading || Boolean(question)} onClick={onDrawQuestion}>
            <Gavel size={20} />
            {isLoading ? 'جاري السحب' : 'سؤال جديد'}
          </button>
          <button type="button" className="auction-danger-button" onClick={onEndGame}>
            <Trophy size={20} />
            إنهاء اللعبة
          </button>
        </div> : null}

        {!isScreenMode && editingTeam !== null ? (
          <AuctionDialog onClose={() => setEditingTeam(null)}>
            <h2>{rewardUnits.text('تعديل كيلومترات')} {teams[editingTeam]?.name}</h2>
            <div className="auction-score-editor">
              <button type="button" onClick={() => setEditScore((current) => String(Math.max(0, (Number(current) || 0) - 100)))}>
                <Minus size={22} />
              </button>
              <input value={editScore} onChange={(event) => setEditScore(event.target.value)} inputMode="numeric" />
              <button type="button" onClick={() => setEditScore((current) => String((Number(current) || 0) + 100))}>
                <Plus size={22} />
              </button>
            </div>
            <div className="auction-modal-actions">
              <button type="button" className="auction-primary-button" onClick={saveScore}>حفظ</button>
              <button type="button" className="auction-secondary-button" onClick={() => setEditingTeam(null)}>إلغاء</button>
            </div>
          </AuctionDialog>
        ) : null}

        {!isScreenMode && phase === 'category' && question ? (
          <AuctionDialog onClose={() => {}}>
            <div className="auction-modal-title-row">
              <h2>الفئة</h2>
              <button type="button" className="auction-change-question" disabled={isLoading} title="تغيير الفئة" onClick={onChangeQuestion}>
                <RefreshCw size={20} />
              </button>
            </div>
            <div className="auction-category-card">{question.category}</div>
            <p className="auction-modal-lead">اختر الفريق الذي سيزايد:</p>
            <div className="auction-dialog-team-grid">
              {teams.map((team, index) => (
                <button type="button" className="auction-secondary-button" key={team.name} onClick={() => onSelectBidder(index)}>
                  {team.name}
                </button>
              ))}
            </div>
          </AuctionDialog>
        ) : null}

        {!isScreenMode && phase === 'bid' && bidderIndex !== null ? (
          <AuctionDialog onClose={() => {}}>
            <h2>{question?.category}</h2>
            <p className="auction-modal-lead">الفريق: {teams[bidderIndex]?.name}</p>
            <div className="auction-bid-display">{bid.toLocaleString()}</div>
            <div className="auction-bid-controls">
              <button type="button" onClick={onDecreaseBid}><Minus size={24} /></button>
              <span>100</span>
              <button type="button" onClick={onIncreaseBid}><Plus size={24} /></button>
            </div>
            <button type="button" className="auction-primary-button w-full" onClick={onConfirmBid}>تأكيد المزاد</button>
          </AuctionDialog>
        ) : null}

        {<AuctionQuestionDialog isScreenMode={isScreenMode} phase={phase} question={question} isLoading={isLoading} onChangeQuestion={onChangeQuestion} bid={bid} showAnswer={showAnswer} onShowAnswer={onShowAnswer} onFinishBid={onFinishBid} />}

        {<AuctionWinnerDialog isWinner={isWinner} winnerLabel={winnerLabel} winner={winner} rankings={rankings} isScreenMode={isScreenMode} onReset={onReset} onHome={onHome} />}
      </section>
    </main>
  );
};

export default AuctionBoardView;
