import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useLocation, useNavigate } from '@/lib/router';
import GameIntroOverlay, { useGameIntro } from '@/components/games/shared/GameIntro';
import GameThemeToggle from '@/components/games/shared/GameThemeToggle';
import LetterHiveBackground from '@/components/games/letter-hive/LetterHiveBackground';
import LetterHiveBoard from '@/components/games/letter-hive/LetterHiveBoard';
import LetterHiveFinishOverlay from '@/components/games/letter-hive/LetterHiveFinishOverlay';
import LetterHiveQuestionModal from '@/components/games/letter-hive/LetterHiveQuestionModal';
import LetterHiveScoreCard from '@/components/games/letter-hive/LetterHiveScoreCard';
import LetterHiveTeamsView from '@/components/games/letter-hive/LetterHiveTeamsView';
import { buildBoardLetters, hasWinningPath } from '@/components/games/letter-hive/letterHiveLogic';
import { loadQuestionBank, loadSharedQuestionBank } from '@/components/games/letter-hive/letterHiveStorage';
import { allocateQuestionGroups } from '@/services/gameUsedQuestions';
import useGamePresenterOrigin from '@/hooks/useGamePresenterOrigin';
import { getCulturalCompetitionHomePath } from '@/lib/culturalCompetitionNavigation';
import '@/components/games/letter-hive/letterHive.css';
import { secureRandomId } from '../../shared/secure-random.js';

const DEFAULT_TEAMS = ['الأحمر', 'الأخضر'];

const LetterHiveGame = () => {
  const { introVisible, playIntro } = useGameIntro(true);
  const navigate = useNavigate();
  const presenterOrigin = useGamePresenterOrigin();
  const location = useLocation();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const queryGameId = searchParams.get('game') || '';
  const queryControlToken = searchParams.get('control') || '';
  const role = searchParams.get('role') === 'screen' ? 'screen' : 'host';
  const isScreenMode = role === 'screen';
  const [sessionId, setSessionId] = useState(queryGameId);
  const [controlToken, setControlToken] = useState(queryControlToken);
  const [started, setStarted] = useState(Boolean(queryGameId));
  const [presenterMode, setPresenterMode] = useState(true);
  const [teamNames, setTeamNames] = useState(['', '']);
  const [questions, setQuestions] = useState(loadQuestionBank);
  const [scoreRed, setScoreRed] = useState(0);
  const [scoreGreen, setScoreGreen] = useState(0);
  const [hexes, setHexes] = useState(new Array(25).fill(null));
  const [letters, setLetters] = useState(() => buildBoardLetters());
  const [targetHex, setTargetHex] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [winMessage, setWinMessage] = useState('');
  const [sessionError, setSessionError] = useState('');

  useEffect(() => {
    if (isScreenMode) return undefined;
    let active = true;
    loadSharedQuestionBank().then((bank) => {
      if (active) setQuestions(bank);
    }).catch((error) => {
      if (active) setSessionError(error.message || 'تعذر تحميل بنك الأسئلة المشترك.');
    });
    return () => { active = false; };
  }, [isScreenMode]);

  const displayTeamNames = useMemo(
    () => teamNames.map((name, index) => name.trim() || DEFAULT_TEAMS[index]),
    [teamNames],
  );

  const publicState = useMemo(() => ({
    teamNames: displayTeamNames,
    scoreRed,
    scoreGreen,
    hexes,
    letters,
    winMessage,
  }), [displayTeamNames, scoreRed, scoreGreen, hexes, letters, winMessage]);

  const presenterUrl = presenterMode && sessionId
    ? `${presenterOrigin}/letter-hive?game=${sessionId}&role=host&control=${encodeURIComponent(controlToken)}`
    : '';

  const buildPublicState = (overrides = {}) => ({
    teamNames: displayTeamNames,
    scoreRed: 0,
    scoreGreen: 0,
    hexes: new Array(25).fill(null),
    letters,
    winMessage: '',
    ...overrides,
  });

  const applySessionState = (state) => {
    if (!state) return;
    const nextTeamNames = Array.isArray(state.teamNames) ? state.teamNames : DEFAULT_TEAMS;
    setTeamNames(nextTeamNames);
    setScoreRed(Number(state.scoreRed || 0));
    setScoreGreen(Number(state.scoreGreen || 0));
    setHexes(Array.isArray(state.hexes) && state.hexes.length === 25 ? state.hexes : new Array(25).fill(null));
    setLetters(Array.isArray(state.letters) && state.letters.length === 25 ? state.letters : buildBoardLetters());
    setWinMessage(state.winMessage || '');
  };

  const createSession = async (state) => {
    const id = secureRandomId('letter-hive');
    const response = await fetch('/api/cultural-games/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, gameType: 'letter-hive', state }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'تعذر إنشاء الجولة.');
    setSessionId(data.id);
    setControlToken(data.controlToken);
    setSessionError('');
    return data;
  };

  const saveSession = async (nextState) => {
    if (!presenterMode || !sessionId || isScreenMode) return;
    try {
      await fetch(`/api/cultural-games/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-game-control-token': controlToken },
        body: JSON.stringify({ state: nextState }),
      });
    } catch (error) {
      setSessionError(error.message || 'تعذر تحديث شاشة العرض.');
    }
  };

  useEffect(() => {
    if (!queryGameId) return undefined;
    let alive = true;

    const loadSession = async () => {
      try {
        const response = await fetch(`/api/cultural-games/sessions/${queryGameId}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('not-found');
        const data = await response.json();
        if (!alive) return;
        setSessionId(queryGameId);
        setPresenterMode(true);
        applySessionState(data.state);
        setStarted(true);
        setSessionError('');
      } catch {
        if (alive) setSessionError('تعذر تحميل الجولة.');
      }
    };

    void loadSession();
    const timer = isScreenMode ? setInterval(loadSession, 1000) : null;

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [queryGameId, isScreenMode]);

  useEffect(() => {
    if (!presenterMode || queryGameId || sessionId || started) return undefined;
    let alive = true;

    createSession(buildPublicState()).catch((error) => {
      if (alive) setSessionError(error.message || 'تعذر إنشاء باركود الشاشة.');
    });

    return () => {
      alive = false;
    };
  }, [presenterMode, queryGameId, sessionId, started]);

  const handleTeamChange = (index, value) => {
    setTeamNames((current) => current.map((entry, entryIndex) => (entryIndex === index ? value : entry)));
  };

  const handlePresenterModeChange = (nextMode) => {
    setPresenterMode(nextMode);
    setSessionError('');
    if (!nextMode) {
      setSessionId('');
    }
  };

  const startGame = async (event) => {
    event.preventDefault();
    const nextLetters = buildBoardLetters();
    const nextState = {
      teamNames: displayTeamNames,
      scoreRed: 0,
      scoreGreen: 0,
      hexes: new Array(25).fill(null),
      letters: nextLetters,
      winMessage: '',
    };

    if (presenterMode) {
      try {
        const session = sessionId ? { id: sessionId, controlToken } : await createSession(nextState);
        const response = await fetch(`/api/cultural-games/sessions/${session.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'x-game-control-token': session.controlToken },
          body: JSON.stringify({ state: nextState }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'تعذر إنشاء الجولة.');
        setSessionId(session.id);
        applySessionState(nextState);
        navigate(`/letter-hive?game=${session.id}&role=screen`, { replace: true });
      } catch (error) {
        setSessionError(error.message || 'تعذر إنشاء الجولة.');
        return;
      }
    } else {
      applySessionState(nextState);
      navigate('/letter-hive', { replace: true });
    }

    await playIntro();
    setStarted(true);
  };

  const resetRound = () => {
    const nextLetters = buildBoardLetters();
    setHexes(new Array(25).fill(null));
    setLetters(nextLetters);
    setTargetHex(null);
    setCurrentQuestion(null);
    setShowAnswer(false);
    setWinMessage('');
    setQuestions(loadQuestionBank());
    void saveSession({
      ...publicState,
      hexes: new Array(25).fill(null),
      letters: nextLetters,
      winMessage: '',
    });
  };

  const openQuestion = async (index) => {
    if (hexes[index] || winMessage) return;
    const letter = letters[index];
    const list = questions[letter] || [];

    if (list.length === 0) {
      setCurrentQuestion({ question: 'لا يوجد سؤال لهذا الحرف بعد.', answer: '' });
      setTargetHex(index);
      setShowAnswer(false);
      return;
    }

    try {
      const groupId = `hex${index}`;
      const allocated = await allocateQuestionGroups('letter-hive', [{
        id: groupId,
        questionIds: list.map((item) => item.id),
      }], 1);
      const selectedId = allocated[groupId]?.[0];
      const selected = list.find((item) => item.id === selectedId) || list[0];
      setCurrentQuestion(selected);
      setTargetHex(index);
      setShowAnswer(false);
    } catch {
      setCurrentQuestion({ question: 'تعذر سحب السؤال، حاول مرة أخرى.', answer: '' });
      setTargetHex(index);
      setShowAnswer(false);
    }
  };

  const changeQuestion = async () => {
    if (targetHex === null) return;
    const letter = letters[targetHex];
    const list = questions[letter] || [];
    if (list.length <= 1) return;

    try {
      const pool = list.filter((item) => item.id !== currentQuestion?.id);
      const allocated = await allocateQuestionGroups('letter-hive', [{
        id: 'change',
        questionIds: pool.map((item) => item.id),
      }], 1);
      const selectedId = allocated.change?.[0];
      const selected = pool.find((item) => item.id === selectedId) || pool[0];
      if (!selected) return;
      setCurrentQuestion(selected);
      setShowAnswer(false);
    } catch {
      setCurrentQuestion((current) => current || { question: 'تعذر تغيير السؤال.', answer: '' });
    }
  };

  const assignColor = (color) => {
    if (targetHex === null) return;
    const nextHexes = [...hexes];
    nextHexes[targetHex] = color;
    let nextScoreRed = scoreRed;
    let nextScoreGreen = scoreGreen;
    let nextWinMessage = '';
    setHexes(nextHexes);
    setTargetHex(null);
    setCurrentQuestion(null);
    setShowAnswer(false);

    if (hasWinningPath(color, nextHexes)) {
      if (color === 'red') {
        nextScoreRed += 1;
        nextWinMessage = `فاز الفريق ${displayTeamNames[0]}!`;
        setScoreRed(nextScoreRed);
        setWinMessage(nextWinMessage);
      } else {
        nextScoreGreen += 1;
        nextWinMessage = `فاز الفريق ${displayTeamNames[1]}!`;
        setScoreGreen(nextScoreGreen);
        setWinMessage(nextWinMessage);
      }
    }

    void saveSession({
      teamNames: displayTeamNames,
      scoreRed: nextScoreRed,
      scoreGreen: nextScoreGreen,
      hexes: nextHexes,
      letters,
      winMessage: nextWinMessage,
    });
  };

  if (!started) {
    return (
      <>
        <GameIntroOverlay visible={introVisible} title="خلية الحروف" />
        <LetterHiveTeamsView
          teamNames={teamNames}
          presenterMode={presenterMode}
          sessionError={sessionError}
          presenterUrl={presenterUrl}
          onPresenterModeChange={handlePresenterModeChange}
          onTeamChange={handleTeamChange}
          onSubmit={startGame}
        />
      </>
    );
  }

  return (
    <main className={`letter-hive-page letter-hive-game-page ${isScreenMode ? 'is-display-screen' : ''}`} dir="rtl">
      <GameIntroOverlay visible={introVisible} title="خلية الحروف" />
      <Helmet><title>خلية الحروف</title></Helmet>
      <LetterHiveBackground />
      <GameThemeToggle />
      {sessionError ? <div className="letter-hive-session-error letter-hive-session-banner">{sessionError}</div> : null}
      <div className="letter-hive-mobile-score">
        <LetterHiveScoreCard name={displayTeamNames[0]} score={scoreRed} color="#df103a" side="right" />
        <LetterHiveScoreCard name={displayTeamNames[1]} score={scoreGreen} color="#10dfb5" side="left" />
      </div>
      <div className="letter-hive-stage">
        <div className="letter-hive-board-wrap">
          <div className="letter-hive-side-score letter-hive-side-score-left">
            <LetterHiveScoreCard name={displayTeamNames[1]} score={scoreGreen} color="#10dfb5" side="left" />
          </div>
          <div className="letter-hive-side-score letter-hive-side-score-right">
            <LetterHiveScoreCard name={displayTeamNames[0]} score={scoreRed} color="#df103a" side="right" />
          </div>
          <div className="letter-hive-board-scale">
            <LetterHiveBoard hexes={hexes} letters={letters} onHexClick={isScreenMode ? () => {} : openQuestion} />
          </div>
        </div>
      </div>
      {targetHex !== null && currentQuestion && !isScreenMode ? (
        <LetterHiveQuestionModal
          questionId={currentQuestion.id}
          team1={displayTeamNames[0]}
          team2={displayTeamNames[1]}
          question={currentQuestion.question}
          answer={currentQuestion.answer}
          showAnswer={showAnswer}
          onChangeQuestion={changeQuestion}
          onClose={() => {
            setTargetHex(null);
            setCurrentQuestion(null);
            setShowAnswer(false);
          }}
          onShowAnswer={() => setShowAnswer(true)}
          onAssign={assignColor}
        />
      ) : null}
      {winMessage ? (
        <LetterHiveFinishOverlay
          message={winMessage}
          onReset={resetRound}
          onHome={() => navigate(getCulturalCompetitionHomePath())}
          showActions={!isScreenMode}
        />
      ) : null}
    </main>
  );
};

export default LetterHiveGame;
