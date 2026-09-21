import React, { useEffect, useRef, useState } from 'react';
import { Eye, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const STEP_MS = 560;

const CaveMemoryGame = ({ challenge, isSubmitting, onComplete }) => {
  const sequence = challenge.previewSequence || challenge.sequence || [];
  const [previewStep, setPreviewStep] = useState(0);
  const [previewing, setPreviewing] = useState(true);
  const [selected, setSelected] = useState([]);
  const replayCount = useRef(0);

  useEffect(() => {
    if (!previewing) return undefined;
    if (previewStep >= sequence.length) {
      const endTimer = window.setTimeout(() => { setPreviewing(false); setPreviewStep(-1); }, 300);
      return () => window.clearTimeout(endTimer);
    }
    const timer = window.setTimeout(() => setPreviewStep((current) => current + 1), STEP_MS);
    return () => window.clearTimeout(timer);
  }, [previewStep, previewing, sequence.length]);

  const replay = () => {
    if (replayCount.current >= 1 || isSubmitting) return;
    replayCount.current += 1;
    setSelected([]);
    setPreviewStep(0);
    setPreviewing(true);
  };

  const choose = (cell) => {
    if (previewing || selected.includes(cell) || selected.length >= sequence.length) return;
    setSelected((current) => [...current, cell]);
  };

  return (
    <div className="summit-game">
      <p className="summit-game-instruction">{previewing ? 'راقب الأضواء واحدًا تلو الآخر واحفظ الطريق.' : 'المس الخانات بنفس ترتيب الإضاءة.'}</p>
      <div className="cave-status" aria-live="polite">{previewing ? <><Eye className="me-1 inline h-4 w-4" /> مرحلة الحفظ</> : `اختيار ${selected.length + 1} من ${sequence.length}`}</div>
      <div className="cave-board">
        <div className="cave-grid">
          {Array.from({ length: challenge.cells }, (_, cell) => {
            const pickedOrder = selected.indexOf(cell);
            const lit = previewing && sequence[previewStep] === cell;
            return (
              <button
                key={cell}
                type="button"
                aria-label={`الخانة ${cell + 1}`}
                disabled={previewing || isSubmitting}
                className={`cave-rune ${lit ? 'is-lit' : ''} ${pickedOrder >= 0 ? 'is-picked' : ''}`}
                onClick={() => choose(cell)}
              >{pickedOrder >= 0 ? pickedOrder + 1 : '✦'}</button>
            );
          })}
        </div>
      </div>
      <div className="summit-game-progress" aria-label={`${selected.length} من ${sequence.length}`}>
        {sequence.map((cell, index) => <span key={`${cell}-${index}`} className={index < selected.length ? 'is-complete' : index === selected.length && !previewing ? 'is-current' : ''} />)}
      </div>
      {!previewing && selected.length < sequence.length && replayCount.current < 1 ? <Button type="button" variant="ghost" className="mx-auto min-h-11 text-white/70" onClick={replay}><RotateCcw className="me-2 h-4 w-4" /> مشاهدة مرة أخرى</Button> : null}
      <Button className="summit-game-action" disabled={selected.length !== sequence.length || isSubmitting} onClick={() => onComplete({ selected })}>تأكيد الطريق</Button>
    </div>
  );
};

export default CaveMemoryGame;
