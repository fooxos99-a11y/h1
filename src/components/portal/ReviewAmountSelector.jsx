import React, { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MAX_REVIEW_FACES, selectReviewFaces, reviewRangeLabel } from '../../../shared/quran-review-cycle.js';

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
        <SelectContent align="center" sideOffset={2} className="z-[140] !w-24 !min-w-24 max-h-56"
          onScrollCapture={event => {
            const viewport = event.target;
            if (viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 88) {
              setVisibleFaces(limit => Math.min(MAX_REVIEW_FACES, limit + 20));
            }
          }}>
          {amounts.map(amount => <SelectItem key={amount} value={String(amount)} showIndicator={false}
            className="min-h-11 justify-center px-2 text-xs" textClassName="text-center">{amount}</SelectItem>)}
        </SelectContent>
      </Select>
      <span>وجه</span>
    </div>}
    {selection?.ranges.map((range, index) => <span key={index}>{index > 0 ? 'ثم ' : ''}{reviewRangeLabel(range)}</span>)}
  </div>;
}
