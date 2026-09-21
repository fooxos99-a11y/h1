import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import LoadingSpinner from './loading-spinner';

const ScreenLoadingContext = createContext(null);
export const useScreenLoading = () => useContext(ScreenLoadingContext);

export default function ScreenLoadingProvider({ children }) {
  const requests = useRef(new Set());
  const timer = useRef(null);
  const [visible, setVisible] = useState(false);
  const acquire = useCallback(() => {
    const token = Symbol('screen-loading');
    requests.current.add(token);
    window.clearTimeout(timer.current);
    setVisible(true);
    return () => {
      requests.current.delete(token);
      if (requests.current.size) return;
      // Keep the same spinner mounted across consecutive route/data loading stages.
      timer.current = window.setTimeout(() => {
        if (!requests.current.size) setVisible(false);
      }, 180);
    };
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return <ScreenLoadingContext.Provider value={acquire}>
    {children}
    {visible && createPortal(<div className="fixed inset-0 z-[1000] grid place-items-center bg-background text-[#0aa3b4]" data-loading-indicator="screen" role="status" aria-live="polite" aria-label="جاري التحميل"><LoadingSpinner size="lg" /></div>, document.body)}
  </ScreenLoadingContext.Provider>;
}
