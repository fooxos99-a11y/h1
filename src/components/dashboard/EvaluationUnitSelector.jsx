import React from 'react';
import { Button } from '@/components/ui/button';

const units = [
  { value: 'face', label: 'لكل وجه' },
  { value: 'quarterFace', label: 'لربع وجه' },
  { value: 'halfFace', label: 'لنصف وجه' },
];

/** Select one evaluation unit using the same accessible, touch-friendly shared button. */
export default function EvaluationUnitSelector({ value, onChange }) {
  return (
    <fieldset className="min-w-0 m-0 grid grid-cols-3 gap-2 rounded-lg border border-primary/15 bg-card p-1" aria-label="مقدار ضوابط التسميع">
      {units.map((unit) => {
        const selected = unit.value === value;
        return (
          <Button key={unit.value} type="button" size="sm" variant={selected ? 'default' : 'ghost'}
            className={selected ? 'text-white hover:text-white' : undefined}
            aria-pressed={selected} onClick={() => onChange(unit.value)}>
            {unit.label}
          </Button>
        );
      })}
    </fieldset>
  );
}
