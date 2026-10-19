import React, { useEffect, useState } from 'react';
import { Button } from './button';
import LoadingSpinner from './loading-spinner';

export default function ScreenLoadingVisual() {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), 15_000);
    return () => window.clearTimeout(timer);
  }, []);
  if (timedOut) return <div className="grid w-full max-w-lg justify-items-center gap-4 p-4 text-center text-foreground [font-family:var(--font-ui)]" dir="rtl">
    <LoadingSpinner size="lg" />
    <p>التحميل أبطأ من المعتاد. يمكنك الانتظار أو إعادة المحاولة.</p>
    <Button type="button" variant="outline" className="min-h-11" onClick={() => window.location.reload()}>إعادة المحاولة</Button>
  </div>;
  return <LoadingSpinner size="lg" />;
}
