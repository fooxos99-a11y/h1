/* global __OTA_CONFIG__ */
import { Capacitor } from '@capacitor/core';
import { createOtaUpdater } from '../services/otaUpdateService.js';

let startupFailed = false;
export function markNativeStartupFailed() {
  startupFailed = true;
}

export function observeNativeOtaReadiness(root) {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('LiveUpdate')) return;
  const config = __OTA_CONFIG__;
  let settledTimer;
  let completed = false;
  const fail = () => { startupFailed = true; };
  window.addEventListener('error', fail);
  window.addEventListener('unhandledrejection', fail);
  const cleanup = () => {
    observer.disconnect();
    window.clearTimeout(settledTimer);
    window.removeEventListener('error', fail);
    window.removeEventListener('unhandledrejection', fail);
  };
  const markReady = async () => {
    if (completed || startupFailed || !root.firstElementChild
      || root.querySelector('[data-app-error], [data-loading-indicator="screen"]')) return;
    completed = true;
    cleanup();
    try {
      const { LiveUpdate } = await import('@capawesome/capacitor-live-update');
      await LiveUpdate.ready();
      const updater = createOtaUpdater({ plugin: LiveUpdate, config });
      const check = () => updater.check().catch(() => {
        // A failed check/download leaves the running bundle intact; retry on the next resume.
        window.dispatchEvent(new CustomEvent('madarij-ota-status', { detail: { status: 'check-failed' } }));
      });
      void check();
      if (config.enabled) {
        const { App } = await import('@capacitor/app');
        let lastCheck = Date.now();
        await App.addListener('appStateChange', ({ isActive }) => {
          if (!isActive || Date.now() - lastCheck < 15 * 60 * 1000) return;
          lastCheck = Date.now();
          void check();
        });
      }
    } catch {
      // Do not acknowledge readiness again: the native timeout remains the recovery authority.
      window.dispatchEvent(new CustomEvent('madarij-ota-status', { detail: { status: 'initialization-failed' } }));
    }
  };
  const inspect = () => {
    window.clearTimeout(settledTimer);
    if (startupFailed || !root.firstElementChild
      || root.querySelector('[data-app-error], [data-loading-indicator="screen"]')) return;
    settledTimer = window.setTimeout(markReady, 1500);
  };
  const observer = new MutationObserver(inspect);
  observer.observe(root, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['data-app-error', 'data-loading-indicator'],
  });
  inspect();
  window.setTimeout(cleanup, 29000);
}
