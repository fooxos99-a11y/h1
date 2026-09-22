import React from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Shape, ScatterArena } from './DailyChallengeShapes';

/** Render and edit the ordered answer without owning the round lifecycle. */
export default function DailyChallengeOrdering({ gameType, challenge, items, selection, setSelection, roundIndex, rounds, roundTransitioning, disabled, completeRound, onSubmit, progress }) {
  const choices = gameType === 'instant_memory' ? challenge.choices : items;
  const remaining = choices.filter((item) => !selection.includes(item.id));
  return (
    <div className={`daily-challenge-ordering daily-challenge-round daily-challenge-classic-game ${roundTransitioning ? 'is-leaving' : ''}`} key={roundIndex} data-size-ordering={gameType === 'size_ordering'}>
      {gameType === 'size_ordering' ? <><div className="daily-challenge-round-heading"><b>الجولة {roundIndex + 1} من {rounds.length}</b><span>المس الأشكال من الأكبر إلى الأصغر</span></div>{progress}</> : <div className="daily-challenge-round-heading"><b>مرحلة الترتيب</b><span>أعد الترتيب الذي شاهدته</span></div>}
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
}
