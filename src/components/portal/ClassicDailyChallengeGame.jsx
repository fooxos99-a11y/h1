import React, { useEffect, useRef, useState } from 'react';
import { Clock3, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const MEMORY_SECONDS = 10;
const SHAPE_CLASS_NAMES = Object.freeze({
  'دائرة': 'circle',
  'مربع': 'square',
  'مثلث': 'triangle',
  'نجمة': 'star',
  'سداسي': 'hexagon',
  'مستطيل': 'rectangle',
});

const Shape = ({ item, size = 72 }) => (
  <span
    className={`daily-challenge-shape daily-challenge-shape-${SHAPE_CLASS_NAMES[item.shape] || 'square'}`}
    style={{ '--shape-size': `${size}px`, '--shape-color': item.color }}
    aria-label={`${item.shape} باللون ${item.color}`}
  />
);

const ScatterArena = ({ items, disabled, onPick, sizeByItem }) => (
  <div className="daily-challenge-options-arena" dir="ltr">
    {items.map((item) => (
      <button key={item.id} type="button" disabled={disabled} onClick={() => onPick(item)} className="daily-challenge-option-item">
        <Shape item={item} size={sizeByItem ? sizeByItem(item) : 68} />
      </button>
    ))}
  </div>
);

const RoundProgress = ({ current, total }) => (
  <div className="daily-challenge-step-progress" aria-label={`الجولة ${current + 1} من ${total}`}>
    {Array.from({ length: total }, (_, index) => <span key={index} className={index < current ? 'is-complete' : index === current ? 'is-current' : ''} />)}
  </div>
);

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
    const columns = currentRound.colors.length <= 9 ? 3 : currentRound.colors.length <= 16 ? 4 : 5;
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

  const choices = gameType === 'instant_memory' ? challenge.choices : items;
  const remaining = choices.filter((item) => !selection.includes(item.id));
  return (
    <div className={`daily-challenge-ordering daily-challenge-round daily-challenge-classic-game ${roundTransitioning ? 'is-leaving' : ''}`} key={roundIndex} data-size-ordering={gameType === 'size_ordering'}>
      {gameType === 'size_ordering' ? <><div className="daily-challenge-round-heading"><b>الجولة {roundIndex + 1} من {rounds.length}</b><span>المس الأشكال من الأكبر إلى الأصغر</span></div><RoundProgress current={roundIndex} total={rounds.length} /></> : <div className="daily-challenge-round-heading"><b>مرحلة الترتيب</b><span>أعد الترتيب الذي شاهدته</span></div>}
      <div className="daily-challenge-selection" dir="ltr" aria-label="ترتيب الإجابة">
        {selection.length ? selection.map((id, index) => {
          const item = choices.find((entry) => entry.id === id);
          return <button type="button" key={id} disabled={disabled} aria-label={`إزالة العنصر ${index + 1}`} onClick={() => setSelection((current) => current.filter((entry) => entry !== id))}><b>{index + 1}</b><Shape item={item} size={52} /></button>;
        }) : <p>{gameType === 'size_ordering' ? 'ستظهر اختياراتك هنا بالترتيب' : 'المس الأشكال بالترتيب الذي حفظته'}</p>}
      </div>
      <ScatterArena items={remaining} disabled={disabled} sizeByItem={(item) => gameType === 'size_ordering' ? item.size : 68} onPick={(item) => setSelection((current) => [...current, item.id])} />
      <div className="daily-challenge-order-actions">
        {selection.length > 0 ? <Button type="button" variant="ghost" disabled={disabled} onClick={() => setSelection([])} className="daily-challenge-reset"><RotateCcw className="h-4 w-4" /> إعادة الترتيب</Button> : null}
        <Button type="button" disabled={disabled || roundTransitioning || selection.length !== items.length} onClick={() => {
          if (gameType === 'size_ordering' && rounds.length > 1) completeRound(selection);
          else onSubmit({ order: selection });
        }} className="daily-challenge-primary bg-[#d7a43b] !text-white">{gameType === 'size_ordering' && roundIndex < rounds.length - 1 ? 'الجولة التالية' : 'تأكيد الترتيب'}</Button>
      </div>
    </div>
  );
};

export default ClassicDailyChallengeGame;
