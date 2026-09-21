import { Helmet } from 'react-helmet';
import { ArrowLeft } from 'lucide-react';
import GameThemeToggle from '@/components/games/shared/GameThemeToggle';
import GamePresenterLink from '@/components/games/shared/GamePresenterLink';
import LetterHiveBackground from './LetterHiveBackground';

const LetterHiveTeamsView = ({
  teamNames,
  presenterMode,
  sessionError,
  presenterUrl,
  onPresenterModeChange,
  onTeamChange,
  onSubmit,
}) => (
    <main className="letter-hive-page" dir="rtl">
      <Helmet><title>خلية الحروف</title></Helmet>
      <LetterHiveBackground />
      <GameThemeToggle />
      <section className={`letter-hive-entry ${presenterMode ? 'letter-hive-entry-with-qr' : ''}`}>
        <div className="letter-hive-entry-main">
          <div className="letter-hive-entry-header">
            <div>
              <div className="h-5" />
              <h1>خلية الحروف</h1>
            </div>
          </div>
          <form onSubmit={onSubmit} className="letter-hive-entry-form">
            <label>
              اسم الفريق الأول
              <input value={teamNames[0]} placeholder="الأحمر" onChange={(event) => onTeamChange(0, event.target.value)} />
            </label>
            <label>
              اسم الفريق الثاني
              <input value={teamNames[1]} placeholder="الأخضر" onChange={(event) => onTeamChange(1, event.target.value)} />
            </label>

            <div className="letter-hive-mode-group" role="radiogroup" aria-label="طريقة عرض الأسئلة">
              <button
                type="button"
                className={presenterMode ? 'is-active' : ''}
                onClick={() => onPresenterModeChange(true)}
              >
                يوجد مقدم
              </button>
              <button
                type="button"
                className={!presenterMode ? 'is-active' : ''}
                onClick={() => onPresenterModeChange(false)}
              >
                إظهار الأسئلة على الشاشة
              </button>
            </div>

            <button type="submit">
              ابدأ اللعبة
              <ArrowLeft size={20} />
            </button>
            {sessionError ? <p className="letter-hive-session-error">{sessionError}</p> : null}
          </form>
        </div>

        {presenterMode ? (
          <aside className="letter-hive-qr-card" aria-label="رابط شاشة المقدم">
            <GamePresenterLink url={presenterUrl} error={sessionError} />
          </aside>
        ) : null}
      </section>
    </main>
);

export default LetterHiveTeamsView;
