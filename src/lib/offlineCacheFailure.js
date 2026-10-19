let reported = false;

export function reportOfflineCacheFailure() {
  if (reported || typeof window === 'undefined') return;
  reported = true;
  window.dispatchEvent(new CustomEvent('madarij-offline-storage-unavailable'));
}
