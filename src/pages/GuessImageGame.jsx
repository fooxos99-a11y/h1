import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@/lib/router';
import GuessImageBoardView from '@/components/games/guess-image/GuessImageBoardView';
import GuessImageStageView from '@/components/games/guess-image/GuessImageStageView';
import GuessImageTeamsView from '@/components/games/guess-image/GuessImageTeamsView';
import GameIntroOverlay, { useGameIntro } from '@/components/games/shared/GameIntro';
import GamePresenterWaiting from '@/components/games/shared/GamePresenterWaiting';
import useGamePresentation from '@/hooks/useGamePresentation';
import { GUESS_IMAGE_QUESTIONS, GUESS_IMAGE_STAGES } from '@/components/games/guess-image/guessImageData';
import { allocateQuestionGroups } from '@/services/gameUsedQuestions';
import { getCulturalCompetitionHomePath } from '@/lib/culturalCompetitionNavigation';
import '@/components/games/guess-image/guessImage.css';

const DEFAULT_TEAMS = ['الفريق الأول', 'الفريق الثاني'];

const GuessImageGame = () => {
  const navigate = useNavigate();
  const { introVisible, playIntro } = useGameIntro(true);
  const [step, setStep] = useState('stage');
  const [selectedStage, setSelectedStage] = useState(null);
  const [teamNames, setTeamNames] = useState(['', '']);
  const [scores, setScores] = useState([0, 0]);
  const [images, setImages] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const applyRemoteState = (state) => {
    if (!state?.started) return;
    setSelectedStage(state.selectedStage || null);
    setTeamNames(Array.isArray(state.teamNames) ? state.teamNames : DEFAULT_TEAMS);
    setScores(Array.isArray(state.scores) ? state.scores : [0, 0]);
    setImages(Array.isArray(state.images) ? state.images : []);
    setCurrentIndex(Number(state.currentIndex || 0));
    setShowAnswer(Boolean(state.showAnswer));
    setStep('game');
  };

  const presentation = useGamePresentation({
    gameKey: 'guess-image',
    gamePath: '/guess-image-game',
    initialState: { started: false },
    onRemoteState: applyRemoteState,
    enabled: false,
  });

  const stages = useMemo(() => {
    if (GUESS_IMAGE_STAGES?.length) return GUESS_IMAGE_STAGES;
    return [{ id: 'default', name: 'المرحلة الأولى' }];
  }, []);

  const displayTeamNames = useMemo(
    () => teamNames.map((name, index) => name.trim() || DEFAULT_TEAMS[index]),
    [teamNames],
  );

  const rankings = useMemo(() => displayTeamNames.map((name, index) => ({
    name,
    score: scores[index],
  })).sort((a, b) => b.score - a.score), [displayTeamNames, scores]);

  const currentQuestion = images[currentIndex] || null;
  const isFinished = images.length > 0 && currentIndex >= images.length;

  const selectStage = async (stage) => {
    setSelectedStage(stage);
    await playIntro();
    setStep('teams');
  };

  const updateTeamName = (index, value) => {
    setTeamNames((current) => current.map((name, nameIndex) => (nameIndex === index ? value : name)));
  };

  const submitTeams = async (event) => {
    event.preventDefault();
    if (isLoading || !selectedStage) return;
    setIsLoading(true);

    try {
      const stageQuestions = GUESS_IMAGE_QUESTIONS.filter((question) => String(question.stageId || 'default') === String(selectedStage.id));
      const source = stageQuestions.length ? stageQuestions : GUESS_IMAGE_QUESTIONS;
      const allocated = await allocateQuestionGroups('guess-image', [{
        id: String(selectedStage.id),
        questionIds: source.map((question) => question.id),
      }], Math.min(10, source.length));
      const selectedIds = allocated[String(selectedStage.id)] || [];
      const nextImages = selectedIds
        .map((id) => source.find((question) => question.id === id))
        .filter(Boolean);

      const preparedImages = nextImages.length ? nextImages : source.slice(0, 10);
      setImages(preparedImages);
      setScores([0, 0]);
      setCurrentIndex(0);
      setShowAnswer(false);
      const opened = await presentation.startScreen({
        started: true,
        selectedStage,
        teamNames: displayTeamNames,
        scores: [0, 0],
        images: preparedImages,
        currentIndex: 0,
        showAnswer: false,
      });
      if (!opened) return;
      await playIntro();
      setStep('game');
    } catch {
      alert('تعذر تجهيز صور المرحلة، حاول مرة أخرى.');
    } finally {
      setIsLoading(false);
    }
  };

  const award = (winnerIndex) => {
    if (winnerIndex !== null) {
      setScores((current) => current.map((score, index) => (index === winnerIndex ? score + 1 : score)));
    }
    setShowAnswer(false);
    setCurrentIndex((index) => index + 1);
  };

  const reset = () => {
    setScores([0, 0]);
    setCurrentIndex(0);
    setShowAnswer(false);
  };

  const presentationState = useMemo(() => ({
    started: step === 'game',
    selectedStage,
    teamNames: displayTeamNames,
    scores,
    images,
    currentIndex,
    showAnswer,
  }), [currentIndex, displayTeamNames, images, scores, selectedStage, showAnswer, step]);

  useEffect(() => {
    if (!presentation.isHost || !presentation.remoteStarted || step !== 'game') return;
    void presentation.publish(presentationState);
  }, [presentation.isHost, presentation.remoteStarted, presentation.publish, presentationState, step]);

  if (presentation.isHost && !presentation.remoteStarted) {
    return <GamePresenterWaiting error={presentation.sessionError} />;
  }

  return (
    <>
      <GameIntroOverlay visible={introVisible} title="خمن الصورة" />
      {step === 'stage' ? (
        <GuessImageStageView
          stages={stages}
          selectedStageId={selectedStage?.id}
          isLoading={isLoading}
          onSelect={selectStage}
        />
      ) : null}
      {step === 'teams' ? (
        <GuessImageTeamsView
          teamNames={teamNames}
          selectedStage={selectedStage}
          isLoading={isLoading}
          onTeamChange={updateTeamName}
          onBack={() => setStep('stage')}
          onSubmit={submitTeams}
        />
      ) : null}
      {step === 'game' ? (
        <GuessImageBoardView
          teamNames={displayTeamNames}
          scores={scores}
          rankings={rankings}
          question={currentQuestion}
          currentIndex={currentIndex}
          totalQuestions={images.length}
          showAnswer={showAnswer}
          isFinished={isFinished}
          onShowAnswer={() => setShowAnswer(true)}
          onAward={award}
          onRestart={reset}
          onHome={() => navigate(getCulturalCompetitionHomePath())}
          isScreenMode={presentation.isScreen}
        />
      ) : null}
    </>
  );
};

export default GuessImageGame;
