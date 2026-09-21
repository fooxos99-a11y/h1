import { Helmet } from 'react-helmet';
import { Eye, RotateCcw, Trophy } from 'lucide-react';
import GameThemeToggle from '@/components/games/shared/GameThemeToggle';
import QuestionTimer from '@/components/games/shared/QuestionTimer';
import WinEffects from '@/components/games/shared/WinEffects';

const GuessImagePhoto = ({ image }) => (
  <div className="guess-image-photo-frame">
    <div className="guess-image-photo-blur" style={{ backgroundImage: `url(${image})` }} />
    <img src={image} alt="صورة التخمين" className="guess-image-photo" />
  </div>
);

const GuessImageBoardView = ({
  teamNames,
  scores,
  rankings,
  question,
  currentIndex,
  totalQuestions,
  showAnswer,
  isFinished,
  onShowAnswer,
  onAward,
  onRestart,
  onHome,
  isScreenMode = false,
}) => (
  <main className={`guess-image-page ${isScreenMode ? 'is-display-screen' : ''}`}>
    <Helmet><title>خمن الصورة</title></Helmet>
    <div className="guess-image-bg" />
    <GameThemeToggle />
    <section className="guess-image-shell">
      <div className="guess-image-scorebar">
        <div className="guess-image-score-card"><h3>{teamNames[0]}</h3><p>{scores[0]}</p></div>
        <div className="guess-image-round-card">{Math.min(currentIndex + 1, totalQuestions)} / {totalQuestions || 0}</div>
        <div className="guess-image-score-card"><h3>{teamNames[1]}</h3><p>{scores[1]}</p></div>
      </div>

      <div className="guess-image-card">
        {question ? (
          <>
            <div className="guess-image-tools">
              <QuestionTimer resetKey={question.id} />
            </div>
            <GuessImagePhoto image={question.image} />
          </>
        ) : (
          <div className="guess-image-empty">
            <Trophy size={54} />
            <h2>انتهت المرحلة</h2>
          </div>
        )}
      </div>

      {question && !showAnswer && !isScreenMode ? (
        <div className="guess-image-controls">
          <button type="button" className="guess-image-primary-button" onClick={onShowAnswer}>
            <Eye size={20} />
            الإجابة
          </button>
        </div>
      ) : null}

      {question && showAnswer && !isScreenMode ? (
        <div className="guess-image-answer-backdrop">
          <div className="guess-image-answer-modal">
            <h2>الإجابة</h2>
            <div className="guess-image-answer">{question.answer}</div>
            <div className="guess-image-winners">
              <button type="button" className="guess-image-primary-button" onClick={() => onAward(0)}>{teamNames[0]}</button>
              <button type="button" className="guess-image-primary-button" onClick={() => onAward(1)}>{teamNames[1]}</button>
              <button type="button" className="guess-image-secondary-button" onClick={() => onAward(null)}>لم يجب أحد</button>
            </div>
          </div>
        </div>
      ) : null}

      {isFinished ? (
        <div className="guess-image-finish">
          <WinEffects fullscreen />
          <div className="guess-image-finish-card">
            <Trophy size={58} />
            <h2>{scores[0] === scores[1] ? 'تعادل!' : `الفائز: ${rankings[0]?.name}`}</h2>
            <div className="guess-image-rankings">
              {rankings.map((team, index) => (
                <div key={`${team.name}-${index}`}>
                  <span>{index + 1}. {team.name}</span>
                  <strong>{team.score}</strong>
                </div>
              ))}
            </div>
            {!isScreenMode ? <><button type="button" className="guess-image-primary-button" onClick={onRestart}>
              <RotateCcw size={20} />
              لعب مرة أخرى
            </button>
            <button type="button" className="guess-image-secondary-button" onClick={onHome}>
              العودة للرئيسية
            </button>
            </> : null}
          </div>
        </div>
      ) : null}
    </section>
  </main>
);

export default GuessImageBoardView;
