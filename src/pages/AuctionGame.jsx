import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@/lib/router';
import AuctionBoardView from '@/components/games/auction/AuctionBoardView';
import AuctionTeamsView from '@/components/games/auction/AuctionTeamsView';
import GameIntroOverlay, { useGameIntro } from '@/components/games/shared/GameIntro';
import GamePresenterWaiting from '@/components/games/shared/GamePresenterWaiting';
import useGamePresentation from '@/hooks/useGamePresentation';
import { AUCTION_QUESTIONS } from '@/components/games/auction/auctionData';
import { pickUnusedQuestion } from '@/services/gameUsedQuestions';
import { getCulturalCompetitionHomePath } from '@/lib/culturalCompetitionNavigation';
import '@/components/games/auction/auctionGame.css';

const MIN_TEAMS = 2;
const MAX_TEAMS = 10;
const INITIAL_SCORE = 1000;
const WIN_SCORE = 10000;

const AuctionGame = () => {
  const navigate = useNavigate();
  const { introVisible, playIntro } = useGameIntro(true);
  const [step, setStep] = useState('teams');
  const [teamNames, setTeamNames] = useState(['', '']);
  const [teams, setTeams] = useState([]);
  const [question, setQuestion] = useState(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [bid, setBid] = useState(100);
  const [bidderIndex, setBidderIndex] = useState(null);
  const [phase, setPhase] = useState('idle');

  const applyRemoteState = (state) => {
    if (!state?.started) return;
    setTeamNames(Array.isArray(state.teamNames) ? state.teamNames : ['', '']);
    setTeams(Array.isArray(state.teams) ? state.teams : []);
    setQuestion(state.question || null);
    setShowAnswer(Boolean(state.showAnswer));
    setBid(Number(state.bid || 100));
    setBidderIndex(state.bidderIndex ?? null);
    setPhase(state.phase || 'idle');
    setStep(state.step === 'winner' ? 'winner' : 'game');
  };

  const presentation = useGamePresentation({
    gameKey: 'auction',
    gamePath: '/auction-game',
    initialState: { started: false },
    onRemoteState: applyRemoteState,
    enabled: false,
  });

  const rankings = useMemo(() => [...teams].sort((a, b) => b.score - a.score), [teams]);
  const winner = rankings[0] || null;
  const winnerLabel = useMemo(() => {
    if (!rankings.length) return '-';
    const topScore = rankings[0].score;
    const winners = rankings.filter((team) => team.score === topScore);
    return winners.length > 1 ? `تعادل: ${winners.map((team) => team.name).join('، ')}` : winners[0].name;
  }, [rankings]);

  const updateTeamName = (index, value) => {
    setTeamNames((current) => current.map((name, nameIndex) => (nameIndex === index ? value : name)));
  };

  const addTeam = () => {
    setTeamNames((current) => current.length >= MAX_TEAMS ? current : [...current, '']);
  };

  const removeTeam = (index) => {
    setTeamNames((current) => current.length <= MIN_TEAMS ? current : current.filter((_, itemIndex) => itemIndex !== index));
  };

  const submitTeams = async (event) => {
    event.preventDefault();
    const normalized = teamNames.map((name) => name.trim());
    if (!normalized.every(Boolean)) return;
    const nextTeams = normalized.map((name) => ({ name, score: INITIAL_SCORE }));
    setTeams(nextTeams);
    const opened = await presentation.startScreen({
      started: true,
      step: 'game',
      teamNames: normalized,
      teams: nextTeams,
      question: null,
      showAnswer: false,
      bid: 100,
      bidderIndex: null,
      phase: 'idle',
    });
    if (!opened) return;
    await playIntro();
    setStep('game');
  };

  const drawQuestion = async () => {
    setIsLoading(true);
    try {
      const nextQuestion = await pickUnusedQuestion('auction', AUCTION_QUESTIONS);
      setQuestion(nextQuestion);
      setBid(100);
      setBidderIndex(null);
      setShowAnswer(false);
      setPhase('category');
    } catch {
      alert('تعذر سحب سؤال، حاول مرة أخرى.');
    } finally {
      setIsLoading(false);
    }
  };

  const changeQuestion = async () => {
    if (!question) return;
    setIsLoading(true);
    try {
      const pool = phase === 'category'
        ? AUCTION_QUESTIONS.filter((item) => item.category !== question.category)
        : AUCTION_QUESTIONS.filter((item) => item.category === question.category && item.id !== question.id);
      const fallbackPool = AUCTION_QUESTIONS.filter((item) => item.id !== question.id);
      const nextQuestion = await pickUnusedQuestion('auction', pool);
      setQuestion(nextQuestion || fallbackPool[0]);
      setShowAnswer(false);
    } catch {
      alert('لا يوجد سؤال آخر متاح.');
    } finally {
      setIsLoading(false);
    }
  };

  const selectBidder = (index) => {
    setBidderIndex(index);
    setBid(100);
    setPhase('bid');
  };

  const confirmBid = () => {
    if (bidderIndex === null) return;
    setShowAnswer(false);
    setPhase('question');
  };

  const finishBid = (isCorrect) => {
    if (bidderIndex === null) return;
    setTeams((current) => {
      const next = current.map((team, index) => {
        if (index !== bidderIndex) return team;
        const score = isCorrect ? team.score + bid : Math.max(0, team.score - bid);
        return { ...team, score };
      });
      if (next[bidderIndex]?.score >= WIN_SCORE) setStep('winner');
      return next;
    });
    setQuestion(null);
    setBidderIndex(null);
    setBid(100);
    setShowAnswer(false);
    setPhase('idle');
  };

  const updateScore = (index, score) => {
    setTeams((current) => current.map((team, itemIndex) => itemIndex === index ? { ...team, score: Math.max(0, Number(score) || 0) } : team));
  };

  const resetGame = () => {
    setStep('teams');
    setTeamNames(['', '']);
    setTeams([]);
    setQuestion(null);
    setShowAnswer(false);
    setBid(100);
    setBidderIndex(null);
    setPhase('idle');
  };

  const presentationState = useMemo(() => ({
    started: step !== 'teams',
    step,
    teamNames,
    teams,
    question,
    showAnswer,
    bid,
    bidderIndex,
    phase,
  }), [bid, bidderIndex, phase, question, showAnswer, step, teamNames, teams]);

  useEffect(() => {
    if (!presentation.isHost || !presentation.remoteStarted || step === 'teams') return;
    void presentation.publish(presentationState);
  }, [presentation.isHost, presentation.remoteStarted, presentation.publish, presentationState, step]);

  if (presentation.isHost && !presentation.remoteStarted) {
    return <GamePresenterWaiting error={presentation.sessionError} />;
  }

  if (step === 'teams') {
    return (
      <>
        <GameIntroOverlay visible={introVisible} title="لعبة المزاد" />
        <AuctionTeamsView
          teamNames={teamNames}
          maxTeams={MAX_TEAMS}
          minTeams={MIN_TEAMS}
          isLoading={isLoading}
          onTeamChange={updateTeamName}
          onAddTeam={addTeam}
          onRemoveTeam={removeTeam}
          onSubmit={submitTeams}
        />
      </>
    );
  }

  return (
    <>
      <GameIntroOverlay visible={introVisible} title="لعبة المزاد" />
      <AuctionBoardView
        teams={teams}
        rankings={rankings}
        winner={winner}
        winnerLabel={winnerLabel}
        bid={bid}
        question={question}
        showAnswer={showAnswer}
        isLoading={isLoading}
        bidderIndex={bidderIndex}
        phase={phase}
        isWinner={step === 'winner'}
        onDrawQuestion={drawQuestion}
        onChangeQuestion={changeQuestion}
        onSelectBidder={selectBidder}
        onDecreaseBid={() => setBid((current) => Math.max(100, current - 100))}
        onIncreaseBid={() => setBid((current) => current + 100)}
        onConfirmBid={confirmBid}
        onShowAnswer={() => setShowAnswer(true)}
        onFinishBid={finishBid}
        onUpdateScore={updateScore}
        onEndGame={() => setStep('winner')}
        onReset={resetGame}
        onHome={() => navigate(getCulturalCompetitionHomePath())}
        isScreenMode={presentation.isScreen}
      />
    </>
  );
};

export default AuctionGame;
