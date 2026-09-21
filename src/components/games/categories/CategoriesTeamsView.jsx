import React from 'react';
import { Helmet } from 'react-helmet';
import { ArrowLeft } from 'lucide-react';
import GameThemeToggle from '@/components/games/shared/GameThemeToggle';

const CategoriesTeamsView = ({ teamNames, onTeamChange, onSubmit }) => (
  <main className="categories-game-page">
    <Helmet><title>لعبة الفئات</title></Helmet>
    <div className="categories-game-bg" />
    <GameThemeToggle />
    <section className="categories-entry">
      <div className="categories-panel">
        <div className="h-5" />
        <h1 className="categories-title">لعبة الفئات</h1>
        <form className="categories-form" onSubmit={onSubmit}>
          <label>
            اسم الفريق الأول
            <input value={teamNames[0]} placeholder="الفريق الأول" onChange={(event) => onTeamChange(0, event.target.value)} />
          </label>
          <label>
            اسم الفريق الثاني
            <input value={teamNames[1]} placeholder="الفريق الثاني" onChange={(event) => onTeamChange(1, event.target.value)} />
          </label>
          <button type="submit" className="categories-primary-button">
            اختيار الفئات
            <ArrowLeft size={20} />
          </button>
        </form>
      </div>
    </section>
  </main>
);

export default CategoriesTeamsView;
