import React from 'react';
import { Helmet } from 'react-helmet';
import GameThemeToggle from '@/components/games/shared/GameThemeToggle';
import CategoriesQuestionModal from './CategoriesQuestionModal';
import CategoriesWinnerModal from './CategoriesWinnerModal';

const CategoriesBoardView = ({
  teamNames,
  scores,
  turn,
  gameCategories,
  activeQuestion,
  showAnswer,
  winner,
  onChooseQuestion,
  onChangeQuestion,
  onShowAnswer,
  onFinishQuestion,
  onRestart,
  onHome,
  isScreenMode = false,
}) => (
  <main className={`categories-game-page ${isScreenMode ? 'is-display-screen' : ''}`}>
    <Helmet><title>لعبة الفئات</title></Helmet>
    <div className="categories-game-bg" />
    <GameThemeToggle />
    <section className="categories-board-shell">
      <div className="categories-scorebar">
        <div className="categories-score-card"><h3>{teamNames[0]}</h3><p>{scores[0]}</p></div>
        <div className="categories-turn">الدور: {teamNames[turn]}</div>
        <div className="categories-score-card"><h3>{teamNames[1]}</h3><p>{scores[1]}</p></div>
      </div>
      <div className="categories-board">
        {gameCategories.map((category) => (
          <div key={category.id} className="categories-column">
            <div className="categories-column-title">{category.name}</div>
            {category.questions.map((question) => (
              <button key={question.id} type="button" disabled={question.answered || isScreenMode} onClick={() => onChooseQuestion(category.id, question)} className="categories-question-cell">
                {question.answered ? '✓' : question.points}
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>

    {!isScreenMode ? <CategoriesQuestionModal
      activeQuestion={activeQuestion}
      showAnswer={showAnswer}
      teamNames={teamNames}
      onChangeQuestion={onChangeQuestion}
      onShowAnswer={onShowAnswer}
      onFinish={onFinishQuestion}
    /> : null}
    <CategoriesWinnerModal winner={winner} onRestart={onRestart} onHome={onHome} showActions={!isScreenMode} />
  </main>
);

export default CategoriesBoardView;
