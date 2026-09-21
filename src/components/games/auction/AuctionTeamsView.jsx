import React from 'react';
import { Helmet } from 'react-helmet';
import { ArrowLeft, Minus, Plus } from 'lucide-react';
import GameThemeToggle from '@/components/games/shared/GameThemeToggle';

const AuctionTeamsView = ({
  teamNames,
  minTeams,
  maxTeams,
  isLoading,
  onTeamChange,
  onAddTeam,
  onRemoveTeam,
  onSubmit,
}) => (
  <main className="auction-game-page">
    <Helmet><title>لعبة المزاد</title></Helmet>
    <div className="auction-game-bg" />
    <GameThemeToggle />
    <section className="auction-entry">
      <div className="auction-panel">
        <div className="h-5" />
        <h1 className="auction-title">لعبة المزاد</h1>
        <form className="auction-form" onSubmit={onSubmit}>
          <div className="auction-team-fields">
            {teamNames.map((name, index) => (
              <div className="auction-team-row" key={index}>
                <input
                  value={name}
                  placeholder={`اكتب اسم الفريق ${index + 1}`}
                  onChange={(event) => onTeamChange(index, event.target.value)}
                />
                <button
                  type="button"
                  className="auction-icon-button"
                  disabled={teamNames.length <= minTeams}
                  title="حذف الفريق"
                  onClick={() => onRemoveTeam(index)}
                >
                  <Minus size={20} />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="auction-secondary-button"
            disabled={teamNames.length >= maxTeams}
            onClick={onAddTeam}
          >
            <Plus size={20} />
            إضافة فريق
          </button>

          <button type="submit" className="auction-primary-button" disabled={isLoading || !teamNames.every((name) => name.trim())}>
            ابدأ اللعبة
            <ArrowLeft size={20} />
          </button>
        </form>
      </div>
    </section>
  </main>
);

export default AuctionTeamsView;
