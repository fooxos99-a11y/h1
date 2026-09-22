import DailyChallengeOrdering from './DailyChallengeOrdering';
import { Shape } from './DailyChallengeShapes';
import React, { useEffect, useRef, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const MEMORY_SECONDS = 10;
const RoundProgress = ({ current, total }) => { return (<div className="daily-challenge-step-progress" aria-label={`الجولة ${current + 1} من ${total}`}>
    {Array.from({ length: total }, (_, index) => { const _resolveClassName = () => {
                                                     if (index < current) {
                                                       return 'is-complete';
                                                     }
                                                     if (index === current) {
                                                       return 'is-current';
                                                     }
                                                     return '';
                                                   };
                                                   return (<span key={index} className={_resolveClassName()} />); })}
  </div>); };

const ClassicDailyChallengeGame = ({ attempt, onSubmit, disabled }) => {
  const { gameType, challenge } = attempt;
  const [selection, setSelection] = useState([]);
  const [problemIndex, setProblemIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [roundAnswers, setRoundAnswers] = useState([]);
  const [roundTransitioning, setRoundTransitioning] = useState(false);
  const [memorizing, setMemorizing] = useState(gameType === 'instant_memory');
  const [memorySeconds, setMemorySeconds] = useState(MEMORY_SECONDS);
  const transitionTimeout = useRef(null);
  const rounds = Array.isArray(challenge.rounds) ? challenge.rounds : [challenge];
  const currentRound = rounds[roundIndex];

  useEffect(() => () => window.clearTimeout(transitionTimeout.current), []);

  const completeRound = (answer) => {
    if (roundTransitioning) return;
    const nextAnswers = [...roundAnswers, answer];
    if (roundIndex === rounds.length - 1) {
      onSubmit(gameType === 'color_difference' ? { answers: nextAnswers } : { orders: nextAnswers });
      return;
    }
    setRoundTransitioning(true);
    transitionTimeout.current = window.setTimeout(() => {
      setRoundAnswers(nextAnswers);
      setRoundIndex((current) => current + 1);
      setSelection([]);
      setRoundTransitioning(false);
    }, 320);
  };

  useEffect(() => {
    if (!memorizing) return undefined;
    const timer = window.setInterval(() => setMemorySeconds((current) => {
      if (current <= 1) {
        window.clearInterval(timer);
        setMemorizing(false);
        return 0;
      }
      return current - 1;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [memorizing]);

  if (gameType === 'color_difference') {
    const _resolveColumns = () => {
      if (currentRound.colors.length <= 9) {
        return 3;
      }
      if (currentRound.colors.length <= 16) {
        return 4;
      }
      return 5;
    };
    const columns = _resolveColumns();
    return (
      <div className={`daily-challenge-round daily-challenge-classic-game ${roundTransitioning ? 'is-leaving' : ''}`} key={roundIndex}>
        <div className="daily-challenge-round-heading"><b>الجولة {roundIndex + 1} من {rounds.length}</b><span>اعثر على المربع المختلف قليلًا</span></div>
        <RoundProgress current={roundIndex} total={rounds.length} />
        <div className="daily-challenge-color-grid" style={{ '--color-columns': columns }}>
          {currentRound.colors.map((color, index) => (
            <button key={`${color}-${index}`} type="button" disabled={disabled || roundTransitioning} aria-label={`اللون رقم ${index + 1}`} onClick={() => completeRound(index)} style={{ backgroundColor: color }} />
          ))}
        </div>
      </div>
    );
  }

  if (gameType === 'math_problems') {
    const problem = challenge.problems[problemIndex];
    return (
      <div className="daily-challenge-math daily-challenge-classic-game">
        <div className="daily-challenge-round-heading"><b>السؤال {problemIndex + 1} من {challenge.problems.length}</b><span>اختر الإجابة الصحيحة</span></div>
        <RoundProgress current={problemIndex} total={challenge.problems.length} />
        <div className="daily-challenge-equation" dir="ltr">
          {problem.question} = <span className="inline-block -scale-x-100" aria-label="علامة استفهام">؟</span>
        </div>
        <div className="daily-challenge-options">{problem.options.map((option) => (
          <Button key={option} type="button" disabled={disabled} onClick={() => {
            const next = [...answers, option];
            if (problemIndex === challenge.problems.length - 1) onSubmit({ answers: next });
            else { setAnswers(next); setProblemIndex((current) => current + 1); }
          }}>{option}</Button>
        ))}</div>
      </div>
    );
  }

  const items = currentRound.items;
  if (gameType === 'instant_memory' && memorizing) {
    return (
      <div className="daily-challenge-memory-stage">
        <div className="daily-challenge-memory-heading"><p>احفظ الترتيب من اليسار إلى اليمين</p><span><Clock3 /> {memorySeconds} ثوانٍ</span></div>
        <div className="daily-challenge-memory-row" dir="ltr">{items.map((item, index) => <div className="daily-challenge-memory-item" key={item.id}><b>{index + 1}</b><Shape item={item} size={78} /></div>)}</div>
      </div>
    );
  }

  return <DailyChallengeOrdering {...{ gameType, challenge, items, selection, setSelection, roundIndex, rounds, roundTransitioning, disabled, completeRound, onSubmit }} progress={<RoundProgress current={roundIndex} total={rounds.length} />} />;
};

export default ClassicDailyChallengeGame;
