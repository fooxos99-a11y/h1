import { useCallback, useEffect, useState } from 'react';

const views = new Set(['sessions', 'mushaf', 'store', 'programs', 'calls', 'journey', 'challenge']);
const readView = () => {
  const value = window.location.hash.replace('#student/', '');
  return window.location.hash.startsWith('#student/') && views.has(value) ? value : null;
};

export default function useStudentHomeNavigation() {
  const [view, setView] = useState(readView);
  const open = useCallback((next) => {
    if (next === readView()) return;
    const depth = Number(window.history.state?.studentHomeDepth || 0);
    window.history.pushState({ ...window.history.state, studentHomeDepth: depth + 1 }, '', `${window.location.pathname}${window.location.search}${next ? `#student/${next}` : ''}`);
    setView(next);
  }, []);
  const back = useCallback(() => {
    if (readView() === 'programs') {
      const url = new URL(window.location.href);
      if (url.searchParams.has('section')) url.searchParams.delete('section');
      else if (url.searchParams.has('program')) url.searchParams.delete('program');
      else url.hash = '';
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
      window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
    } else if (window.history.state?.studentHomeDepth > 0) window.history.back();
    else {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
      setView(null);
    }
  }, []);
  useEffect(() => {
    const sync = () => setView(readView());
    const nativeBack = (event) => { if (readView()) { event.preventDefault(); back(); } };
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    window.addEventListener('madarij-student-back', nativeBack);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('madarij-student-back', nativeBack);
    };
  }, [back]);
  return { view, open, back };
}
