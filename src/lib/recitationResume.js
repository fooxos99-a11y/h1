// Mobile browsers can resume a suspended tab without firing window.focus.
export const appResumeEvent = 'madarij-app-resumed';

export function subscribeRecitationResume({ windowTarget, documentTarget, isOnline, refresh }) {
  const resume = () => {
    if (isOnline() && documentTarget.visibilityState === 'visible') refresh();
  };
  windowTarget.addEventListener('focus', resume);
  windowTarget.addEventListener('online', resume);
  windowTarget.addEventListener(appResumeEvent, resume);
  documentTarget.addEventListener('visibilitychange', resume);
  return () => {
    windowTarget.removeEventListener('focus', resume);
    windowTarget.removeEventListener('online', resume);
    windowTarget.removeEventListener(appResumeEvent, resume);
    documentTarget.removeEventListener('visibilitychange', resume);
  };
}
