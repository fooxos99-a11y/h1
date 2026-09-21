import React from 'react';
import { Helmet } from 'react-helmet';
import GameThemeToggle from '@/components/games/shared/GameThemeToggle';

const GuessImageStageView = ({ stages, selectedStageId, isLoading, onSelect }) => (
  <main className="guess-image-page">
    <Helmet><title>خمن الصورة</title></Helmet>
    <div className="guess-image-bg" />
    <GameThemeToggle />
    <section className="guess-image-entry">
      <div className="guess-image-panel">
        <p className="guess-image-kicker">اختر المرحلة</p>
        <h1 className="guess-image-title">خمن الصورة</h1>
        <div className="guess-image-stage-grid">
          {stages.map((stage) => (
            <button
              key={stage.id}
              type="button"
              className={`guess-image-stage-card ${String(selectedStageId) === String(stage.id) ? 'is-selected' : ''}`}
              disabled={isLoading}
              onClick={() => onSelect(stage)}
            >
              {stage.name}
            </button>
          ))}
        </div>
      </div>
    </section>
  </main>
);

export default GuessImageStageView;
