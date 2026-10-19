import React, { useEffect, useState } from 'react';
import ErrorState from '@/components/ui/error-state';
import LoadingIndicator from '@/components/ui/loading-indicator';
import { appResumeEvent } from '@/lib/recitationResume';
import { refreshAppEntry } from '@/services/entryRefresh';

export default function ConnectedEntryGate({ children }) {
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const refresh = () => { setError(''); setRevision(value => value + 1); };

  useEffect(() => {
    let active = true;
    refreshAppEntry().then(() => {
      if (active) setReady(true);
    }).catch(cause => {
      if (active) setError(cause.message || 'تعذر الاتصال بالخادم. أعد المحاولة.');
    });
    return () => { active = false; };
  }, [revision]);

  useEffect(() => {
    const reload = () => { setError(''); setRevision(value => value + 1); };
    const accountChanged = () => { setReady(false); reload(); };
    // Revalidate on resume without unmounting forms, pending saves and the sync bridge.
    for (const event of [appResumeEvent, 'online']) window.addEventListener(event, reload);
    for (const event of ['madarij-authenticated', 'madarij-session-expired']) window.addEventListener(event, accountChanged);
    return () => {
      for (const event of [appResumeEvent, 'online']) window.removeEventListener(event, reload);
      for (const event of ['madarij-authenticated', 'madarij-session-expired']) window.removeEventListener(event, accountChanged);
    };
  }, []);

  if (error && !ready) return <main className="grid min-h-dvh place-items-center bg-background p-4 [font-family:var(--font-ui)]" dir="rtl"><ErrorState message={error} onRetry={refresh} /></main>;
  if (!ready) return <LoadingIndicator mode="screen" delayMs={0} />;
  return children;
}
