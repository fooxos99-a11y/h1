import React, { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MAX_REVIEW_FACES, selectReviewFaces, reviewRangeLabel } from '../../../shared/quran-review-cycle.js';

// A range can repeat after the cycle wraps, so count repeats to keep keys unique.
function rangeItems(ranges = []) {
  const seen = new Map();
  return ranges.map((range, position) => {
    const base = `${range.start.surah}:${range.start.ayah}-${range.end.surah}:${range.end.ayah}`;
    const repeat = seen.get(base) || 0;
    seen.set(base, repeat + 1);
    return { id: `${base}#${repeat}`, range, first: position === 0 };
  });
}

export default function ReviewAmountSelector({ cycle, value, onChange, editable = true }) {
  const [visibleFaces, setVisibleFaces] = useState(20);
  const valid = Number(value) >= 0.25 && Number(value) <= MAX_REVIEW_FACES;
  const selection = valid ? selectReviewFaces(cycle, Number(value)) : null;
  const amounts = [...new Set([...Array.from({ length: visibleFaces }, (_, index) => index + 1), Number(value)])]
    .filter(amount => Number.isInteger(amount) && amount >= 1 && amount <= MAX_REVIEW_FACES).sort((a, b) => a - b);
  return <div className="flex flex-col items-center gap-1 text-center text-xs font-bold text-muted-foreground" style={{ fontFamily: 'var(--font-ui)' }}>
    {editable && <div className="flex items-center justify-center gap-1">
      <Select value={String(value)} onValueChange={onChange}>
        <SelectTrigger aria-label="مقدار المراجعة بالأوجه" appearance="inline" showChevron={false}
          className="relative z-[1] h-11 w-auto min-w-11 justify-center px-2 text-center text-xs font-black text-primary [&>span]:text-center">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="center" sideOffset={2} className="z-[150] !w-auto !min-w-16 max-h-56 border-primary/25 bg-background/95 text-xs font-black shadow-xl shadow-primary/10 backdrop-blur"
          onScrollCapture={event => {
            const viewport = event.target;
            if (viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 88) {
              setVisibleFaces(limit => Math.min(MAX_REVIEW_FACES, limit + 20));
            }
          }}>
          {amounts.map(amount => <SelectItem key={amount} value={String(amount)} showIndicator={false}
            className="h-9 justify-center px-2 text-center text-xs font-black data-[state=checked]:bg-primary/15 data-[state=checked]:text-primary [&>span:last-child]:text-center" textClassName="text-center">{amount}</SelectItem>)}
        </SelectContent>
      </Select>
      <span>وجه</span>
    </div>}
    {rangeItems(selection?.ranges).map(({ id, range, first }) => <span key={id}>{first ? '' : 'ثم '}{reviewRangeLabel(range)}</span>)}
  </div>;
}
