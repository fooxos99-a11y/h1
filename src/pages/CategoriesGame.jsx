import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@/lib/router';
import CategoriesBoardView from '@/components/games/categories/CategoriesBoardView';
import CategoriesSelectView from '@/components/games/categories/CategoriesSelectView';
import CategoriesTeamsView from '@/components/games/categories/CategoriesTeamsView';
import GameIntroOverlay, { useGameIntro } from '@/components/games/shared/GameIntro';
import GamePresenterWaiting from '@/components/games/shared/GamePresenterWaiting';
import useGamePresentation from '@/hooks/useGamePresentation';
import { loadCategoriesBank } from '@/components/games/categories/categoriesData';
import { allocateQuestionGroups } from '@/services/gameUsedQuestions';
import { getCulturalCompetitionHomePath } from '@/lib/culturalCompetitionNavigation';
import '@/components/games/categories/categoriesGame.css';
import { secureRandomItem } from '../../shared/secure-random.js';

const MAX_CATEGORIES = 6;
const DEFAULT_TEAMS = ['الفريق الأول', 'الفريق الثاني'];

const CategoriesGame = () => {
  const navigate = useNavigate();
  const { introVisible, playIntro } = useGameIntro(true);
  const [step, setStep] = useState('teams');
  const [teamNames, setTeamNames] = useState(['', '']);
  const [scores, setScores] = useState([0, 0]);
  const [turn, setTurn] = useState(0);
  const [categories] = useState(() => loadCategoriesBank());
  const [selectedIds, setSelectedIds] = useState([]);
  const [gameCategories, setGameCategories] = useState([]);
  const [replacementPools, setReplacementPools] = useState({});
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [selectionError, setSelectionError] = useState(false);

  const applyRemoteState = (state) => {
    if (!state?.started) return;
    setTeamNames(Array.isArray(state.teamNames) ? state.teamNames : DEFAULT_TEAMS);
    setScores(Array.isArray(state.scores) ? state.scores : [0, 0]);
    setTurn(Number(state.turn || 0));
    setGameCategories(Array.isArray(state.gameCategories) ? state.gameCategories : []);
    setReplacementPools(state.replacementPools || {});
    setActiveQuestion(state.activeQuestion || null);
    setShowAnswer(Boolean(state.showAnswer));
    setStep('game');
  };

  const presentation = useGamePresentation({
    gameKey: 'categories',
    gamePath: '/categories-game',
    initialState: { started: false },
    onRemoteState: applyRemoteState,
    enabled: false,
  });

  const displayTeamNames = useMemo(
    () => teamNames.map((name, index) => name.trim() || DEFAULT_TEAMS[index]),
    [teamNames],
  );

  const canStart = selectedIds.length === MAX_CATEGORIES;
  const winner = useMemo(() => {
    if (!gameCategories.length || !gameCategories.every((category) => category.questions.every((question) => question.answered))) return null;
    if (scores[0] === scores[1]) return 'تعادل';
    return scores[0] > scores[1] ? displayTeamNames[0] : displayTeamNames[1];
  }, [displayTeamNames, gameCategories, scores]);

  const resetGame = () => {
    setStep('teams');
    setTeamNames(['', '']);
    setScores([0, 0]);
    setTurn(0);
    setSelectedIds([]);
    setGameCategories([]);
    setReplacementPools({});
    setActiveQuestion(null);
    setShowAnswer(false);
    setSelectionError(false);
  };

  const updateTeamName = (index, value) => {
    setTeamNames((current) => current.map((name, nameIndex) => (nameIndex === index ? value : name)));
  };

  const submitTeams = (event) => {
    event.preventDefault();
    setStep('categories');
  };

  const toggleCategory = (id) => {
    setSelectionError(false);
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= MAX_CATEGORIES) return current;
      return [...current, id];
    });
  };

  const startGame = async () => {
    if (isStarting) return;
    if (!canStart) {
      setSelectionError(true);
      return;
    }
    setSelectionError(false);
    setIsStarting(true);

    try {
      const selectedCategories = categories.filter((category) => selectedIds.includes(category.id));
      const allocated = await allocateQuestionGroups('categories', selectedCategories.map((category) => ({
        id: category.id,
        questionIds: category.questions.map((question) => question.id),
      })), 10);
      const nextReplacementPools = {};
      const nextCategories = selectedCategories.map((category) => ({
        ...category,
        questions: (allocated[category.id] || [])
          .map((questionId) => category.questions.find((question) => question.id === questionId))
          .filter(Boolean)
          .slice(0, 5)
          .map((question) => ({ ...question, answered: false })),
      }));
      selectedCategories.forEach((category) => {
        const selectedQuestions = (allocated[category.id] || [])
          .map((questionId) => category.questions.find((question) => question.id === questionId))
          .filter(Boolean);
        nextReplacementPools[category.id] = selectedQuestions.slice(5);
      });

      const nextState = {
        started: true,
        teamNames: displayTeamNames,
        scores: [0, 0],
        turn: 0,
        gameCategories: nextCategories,
        replacementPools: nextReplacementPools,
        activeQuestion: null,
        showAnswer: false,
      };
      setGameCategories(nextCategories);
      setReplacementPools(nextReplacementPools);
      setScores([0, 0]);
      setTurn(0);
      const opened = await presentation.startScreen(nextState);
      if (!opened) return;
      await playIntro();
      setStep('game');
    } catch {
      alert('تعذر تجهيز الأسئلة، حاول مرة أخرى.');
    } finally {
      setIsStarting(false);
    }
  };

  const presentationState = useMemo(() => ({
    started: step === 'game',
    teamNames: displayTeamNames,
    scores,
    turn,
    gameCategories,
    replacementPools,
    activeQuestion,
    showAnswer,
  }), [activeQuestion, displayTeamNames, gameCategories, replacementPools, scores, showAnswer, step, turn]);

  useEffect(() => {
    if (!presentation.isHost || !presentation.remoteStarted || step !== 'game') return;
    void presentation.publish(presentationState);
  }, [presentation.isHost, presentation.remoteStarted, presentation.publish, presentationState, step]);

  if (presentation.isHost && !presentation.remoteStarted) {
    return <GamePresenterWaiting error={presentation.sessionError} />;
  }

  const chooseQuestion = (categoryId, question) => {
    if (question.answered) return;
    setActiveQuestion({ ...question, categoryId, cellId: question.id });
    setShowAnswer(false);
  };

  const changeQuestion = () => {
    if (!activeQuestion) return;
    const available = replacementPools[activeQuestion.categoryId] || [];
    if (!available.length) return;
    const selected = secureRandomItem(available);
    setReplacementPools((current) => ({
      ...current,
      [activeQuestion.categoryId]: (current[activeQuestion.categoryId] || []).filter((question) => question.id !== selected.id),
    }));
    setActiveQuestion({
      ...selected,
      points: activeQuestion.points,
      categoryId: activeQuestion.categoryId,
      cellId: activeQuestion.cellId,
    });
    setShowAnswer(false);
  };

  const finishQuestion = (winnerIndex) => {
    if (!activeQuestion) return;
    setGameCategories((current) => current.map((category) => category.id === activeQuestion.categoryId ? {
      ...category,
      questions: category.questions.map((question) => question.id === activeQuestion.cellId ? { ...question, answered: true } : question),
    } : category));

    if (winnerIndex !== null) {
      setScores((current) => current.map((score, index) => index === winnerIndex ? score + activeQuestion.points : score));
      setTurn(winnerIndex === 0 ? 1 : 0);
    } else {
      setTurn((current) => current === 0 ? 1 : 0);
    }

    setActiveQuestion(null);
    setShowAnswer(false);
  };

  if (step === 'teams') {
    return (
      <>
        <GameIntroOverlay visible={introVisible} title="لعبة الفئات" />
        <CategoriesTeamsView teamNames={teamNames} onTeamChange={updateTeamName} onSubmit={submitTeams} />
      </>
    );
  }

  if (step === 'categories') {
    return (
      <>
        <GameIntroOverlay visible={introVisible} title="لعبة الفئات" />
        <CategoriesSelectView
          categories={categories}
          selectedIds={selectedIds}
          canStart={canStart}
          selectionError={selectionError}
          isStarting={isStarting}
          onToggle={toggleCategory}
          onBack={() => setStep('teams')}
          onStart={startGame}
        />
      </>
    );
  }

  return (
    <>
      <GameIntroOverlay visible={introVisible} title="لعبة الفئات" />
      <CategoriesBoardView
        teamNames={displayTeamNames}
        scores={scores}
        turn={turn}
        gameCategories={gameCategories}
        activeQuestion={activeQuestion}
        showAnswer={showAnswer}
        winner={winner}
        onChooseQuestion={chooseQuestion}
        onChangeQuestion={changeQuestion}
        onShowAnswer={() => setShowAnswer(true)}
        onFinishQuestion={finishQuestion}
        onRestart={resetGame}
        onHome={() => navigate(getCulturalCompetitionHomePath())}
        isScreenMode={presentation.isScreen}
      />
    </>
  );
};

export default CategoriesGame;
