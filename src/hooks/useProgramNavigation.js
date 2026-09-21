import { useEffect, useState } from 'react';
const read = () => {
  const params = new URLSearchParams(window.location.search);
  return { programId: Number(params.get('program') || 0), sectionId: Number(params.get('section') || 0) };
};
export default function useProgramNavigation() {
  const [selection, setSelection] = useState(read);
  useEffect(() => {
    const sync = () => setSelection(read());
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  const open = (programId = 0, sectionId = 0) => {
    const url = new URL(window.location.href);
    for (const [key, value] of [['program', programId], ['section', sectionId]]) {
      if (value) url.searchParams.set(key, String(value)); else url.searchParams.delete(key);
    }
    window.history.pushState({ ...window.history.state, studentHomeDepth: Number(window.history.state?.studentHomeDepth || 0) + 1 }, '', `${url.pathname}${url.search}${url.hash}`);
    setSelection(read());
  };
  return { ...selection, open };
}
