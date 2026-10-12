import { useEffect, useState } from 'react';

const isHttpOrigin = (value) => /^https?:\/\/[^/]+$/i.test(String(value || ''));

const useGamePresenterOrigin = (enabled = true) => {
  const [origin, setOrigin] = useState(() => window.location.origin);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    const port = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
    const loadOrigin = async () => {
      try {
        const response = await fetch(`/api/cultural-games/presenter-origin?port=${encodeURIComponent(port)}`, { cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error('presenter-origin');
        if (active && isHttpOrigin(data.origin)) setOrigin(data.origin);
      } catch {
        if (active) setOrigin(window.location.origin);
      }
    };
    void loadOrigin();
    return () => { active = false; };
  }, [enabled]);

  return origin;
};

export default useGamePresenterOrigin;
