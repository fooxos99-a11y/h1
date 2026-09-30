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
  const wasInert = root.inert;
  const releaseStartup = () => {
    if (!config.enabled) return;
    root.inert = wasInert;
    document.documentElement.classList.remove('ota-startup-check');
  };
  if (config.enabled) {
    root.inert = true;
    document.documentElement.classList.add('ota-startup-check');
  }
  let settledTimer;
  let completed = false;
  const fail = () => { startupFailed = true; releaseStartup(); };
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
      try {
        const result = await updater.check({ applyImmediately: true });
        if (result.status === 'reloading') {
          // The old document should be replaced. Avoid trapping users if native reload stalls.
          window.setTimeout(releaseStartup, 15000);
          return;
        }
        releaseStartup();
      } catch {
        releaseStartup();
        window.dispatchEvent(new CustomEvent('madarij-ota-status', { detail: { status: 'check-failed' } }));
      }
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
      releaseStartup();
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
  window.setTimeout(() => {
    if (completed) return;
    cleanup();
    releaseStartup();
  }, 29000);
}
