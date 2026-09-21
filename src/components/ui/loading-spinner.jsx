import React from 'react';
import { cn } from '@/lib/utils';

const sizeClassNames = {
  xs: 'h-3 w-3 border',
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'loading-spinner--screen',
};

const LoadingSpinner = ({ className, size = 'sm' }) => (
  <span
    className={cn(
      'inline-block shrink-0 animate-spin rounded-full border-current border-t-transparent',
      sizeClassNames[size] || sizeClassNames.sm,
      className,
    )}
    aria-hidden="true"
  />
);

export default LoadingSpinner;
