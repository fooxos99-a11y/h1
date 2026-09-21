import React from 'react';
import { Helmet } from 'react-helmet';
import GameThemeToggle from '@/components/games/shared/GameThemeToggle';

const CategoriesSelectView = ({
  categories,
  selectedIds,
  selectionError,
  isStarting,
  onToggle,
  onBack,
  onStart,
}) => (
  <main className="categories-game-page">
    <Helmet><title>اختيار الفئات</title></Helmet>
    <div className="categories-game-bg" />
    <GameThemeToggle />
    <section className="categories-entry">
      <div className="categories-panel">
        <p className="categories-kicker">اختر 6 فئات</p>
        <h1 className="categories-title">الفئات</h1>
        <div className="categories-grid-select">
          {categories.map((category) => {
            const selected = selectedIds.includes(category.id);
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => onToggle(category.id)}
                className={`categories-choice ${selected ? 'is-selected' : ''}`}
              >
                <span className="categories-choice-name">{category.name}</span>
              </button>
            );
          })}
        </div>
        {selectionError ? <div className="categories-select-error">يجب اختيار 6 فئات</div> : null}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button type="button" className="categories-secondary-button" onClick={onBack}>رجوع</button>
          <button type="button" className="categories-primary-button" disabled={isStarting} onClick={onStart}>
            {isStarting ? 'جاري تجهيز الأسئلة' : 'ابدأ اللعبة'}
          </button>
        </div>
      </div>
    </section>
  </main>
);

export default CategoriesSelectView;
