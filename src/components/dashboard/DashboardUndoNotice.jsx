import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Toast, ToastAction, ToastProvider, ToastTitle, ToastViewport } from '@/components/ui/toast';
import { deferredActions, enableDashboardUndo } from '@/lib/deferredActions';

export default function DashboardUndoNotice({ active }) {
  const actions = useSyncExternalStore(deferredActions.subscribe, deferredActions.getSnapshot);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    enableDashboardUndo(active);
    const cancel = () => deferredActions.cancelAll();
    const undoKey = event => {
      if (!active || !(event.ctrlKey || event.metaKey) || event.shiftKey || event.key.toLowerCase() !== 'z') return;
      if (event.target?.closest?.('input, textarea, [contenteditable="true"]')) return;
      const latest = deferredActions.getSnapshot().at(-1);
      if (!latest) return;
      event.preventDefault();
      deferredActions.cancel(latest.id);
    };
    window.addEventListener('pagehide', cancel);
    window.addEventListener('keydown', undoKey);
    return () => {
      enableDashboardUndo(false);
      window.removeEventListener('pagehide', cancel);
      window.removeEventListener('keydown', undoKey);
    };
  }, [active]);
  useEffect(() => {
    if (!actions.length) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [actions.length]);
  if (!active) return null;
  return <ToastProvider swipeDirection="right">
    {actions.map(action => <Toast key={action.id} open duration={Infinity} data-dashboard-undo=""
      onOpenChange={open => { if (!open) deferredActions.cancel(action.id); }}
      dir="rtl" className="items-center gap-2 px-3 py-2 [font-family:var(--font-ui)]">
      <div className="min-w-0 flex-1">
        <ToastTitle className="text-xs">{action.label}</ToastTitle>
        <span aria-hidden="true" className="text-xs text-muted-foreground">خلال {Math.min(10, Math.max(1, Math.ceil((action.expiresAt - now) / 1000)))} ثوانٍ</span>
      </div>
      <ToastAction className="h-11 min-w-16 shrink-0" altText="التراجع عن الأمر قبل تنفيذه"
        title="تراجع (Ctrl+Z)" aria-keyshortcuts="Control+Z Meta+Z"
        onClick={() => deferredActions.cancel(action.id)}>تراجع</ToastAction>
    </Toast>)}
    {createPortal(<ToastViewport aria-live="polite" aria-label="الأوامر القابلة للتراجع" className="top-auto bottom-[max(1rem,env(safe-area-inset-bottom))] z-[400] max-h-[40dvh] overflow-y-auto sm:top-auto" />, document.body)}
  </ToastProvider>;
}
