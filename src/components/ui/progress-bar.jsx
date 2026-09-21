import React from 'react';
import { cn } from '@/lib/utils';

const ProgressBar = ({ value = 0, className = '', label = 'نسبة التقدم' }) => {
  const normalizedValue = Math.max(0, Math.min(100, Number(value || 0)));

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={normalizedValue}
      className={cn('h-2 w-full min-w-28 overflow-hidden rounded-full bg-primary/20', className)}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
        style={{ width: `${normalizedValue}%` }}
      />
    </div>
  );
};

export default ProgressBar;
