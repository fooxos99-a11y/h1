import React, { useEffect, useLayoutEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useScreenLoading } from './screen-loading-provider';
import LoadingSpinner from '@/components/ui/loading-spinner';

const LoadingIndicator = ({ className, mode = 'inline', delayMs = 180 }) => {
  const isScreen = mode === 'screen';
  const acquire = useScreenLoading();
  useLayoutEffect(() => { if (isScreen && acquire) return acquire(); }, [isScreen, acquire]);
  const [isVisible, setIsVisible] = useState(delayMs <= 0);

  useEffect(() => {
    if (delayMs <= 0) {
      setIsVisible(true);
      return undefined;
    }
    const timer = window.setTimeout(() => setIsVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);

  if (isScreen && acquire) return null;
  return (
    <div
      className={cn(
        isScreen
          ? 'fixed inset-0 z-[100] grid place-items-center bg-background p-6'
          : 'flex items-center justify-center py-12',
        className,
      )}
      data-loading-indicator={isScreen ? 'screen' : 'local'}
      role="status"
      aria-live="polite"
      aria-label="جاري التحميل"
    >
      <div className={cn(
        'flex items-center justify-center text-[#0aa3b4] transition-opacity duration-150',
        isVisible ? 'opacity-100' : 'opacity-0',
      )}>
        <LoadingSpinner size="lg" />
      </div>
    </div>
  );
};

export default LoadingIndicator;
