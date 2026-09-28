import React, { useEffect, useState } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getCachedRequiredNativeUpdate, getRequiredNativeUpdate } from '@/services/nativeUpdateService';

export default function NativeUpdateDialog() {
  const [update, setUpdate] = useState(null);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let disposed = false, pending = false;
    const check = async () => {
      if (pending) return;
      pending = true;
      try {
        const info = await App.getInfo(), platform = Capacitor.getPlatform();
        const cached = getCachedRequiredNativeUpdate(info, platform);
        if (!disposed && cached) setUpdate(cached);
        const policy = await getRequiredNativeUpdate(info, platform);
        if (!disposed) setUpdate(policy);
      } catch {
        // A network failure must not lock out offline users; retry on resume/online.
      } finally { pending = false; }
    };
    void check();
    const listener = App.addListener('appStateChange', ({ isActive }) => { if (isActive) void check(); });
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void check();
    }, 300000);
    window.addEventListener('online', check);
    return () => { disposed = true; window.clearInterval(interval); window.removeEventListener('online', check); void listener.then(handle => handle.remove()); };
  }, []);
  return <Dialog open={Boolean(update)}><DialogContent dir="rtl" aria-describedby={undefined} className="[font-family:var(--font-ui)]" onEscapeKeyDown={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()}>
    <DialogTitle>يلزم تحديث التطبيق للمتابعة</DialogTitle>
    <Button asChild className="min-h-11"><a href={update?.url} target="_blank" rel="noreferrer">تحديث الآن</a></Button>
  </DialogContent></Dialog>;
}
