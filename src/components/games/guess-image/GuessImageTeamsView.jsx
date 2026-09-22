import React from 'react';
import { Helmet } from 'react-helmet';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import GameThemeToggle from '@/components/games/shared/GameThemeToggle';

const GuessImageTeamsView = ({ teamNames, selectedStage, isLoading, onTeamChange, onBack, onSubmit }) => (
  <main className="guess-image-page">
    <Helmet><title>خمن الصورة</title></Helmet>
    <div className="guess-image-bg" />
    <GameThemeToggle />
    <section className="guess-image-entry">
      <div className="guess-image-panel">
        <p className="guess-image-kicker">{selectedStage?.name || 'المرحلة الأولى'}</p>
        <h1 className="guess-image-title">أسماء الفرق</h1>
        <form onSubmit={onSubmit} className="guess-image-form">
          {teamNames.map((name, index) => (
            <label key={index === 0 ? 'first-team' : 'second-team'}>
              {index === 0 ? 'اسم الفريق الأول' : 'اسم الفريق الثاني'}
              <input
                value={name}
                placeholder={index === 0 ? 'الفريق الأول' : 'الفريق الثاني'}
                onChange={(event) => onTeamChange(index, event.target.value)}
              />
            </label>
          ))}
          <div className="guess-image-form-actions">
            <button type="button" className="guess-image-secondary-button" onClick={onBack}>
              <ArrowRight size={20} />
              رجوع
            </button>
            <button type="submit" className="guess-image-primary-button" disabled={isLoading}>
              {isLoading ? 'جاري التجهيز' : 'ابدأ اللعبة'}
              <ArrowLeft size={20} />
            </button>
          </div>
        </form>
      </div>
    </section>
  </main>
);

export default GuessImageTeamsView;
