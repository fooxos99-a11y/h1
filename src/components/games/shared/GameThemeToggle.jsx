import { useEffect } from 'react';

const GameThemeToggle = () => {
  useEffect(() => {
    const root = document.documentElement;
    const wasLight = root.classList.contains('light');
    const wasDark = root.classList.contains('dark');
    const previousScheme = root.style.colorScheme;
    root.classList.remove('light');
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
    return () => {
      root.classList.toggle('light', wasLight);
      root.classList.toggle('dark', wasDark);
      root.style.colorScheme = previousScheme;
    };
  }, []);

  return null;
};

export default GameThemeToggle;
