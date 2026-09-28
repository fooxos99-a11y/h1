const releases = {
  'sa.madarij.app': { android: '1.0.23', storeId: '6798071538', androidUrl: 'https://mdarj.net/downloads/rawasi-android-1.0.23.apk' },
};
export function createNativeUpdatePolicy({ fetchStore = (...args) => fetch(...args), now = Date.now } = {}) {
  const storeChecks = new Map();
  return async (app, platform) => {
    const release = releases[app];
    if (!release || !['android', 'ios'].includes(platform)) return { available: false };
    // Direct APK installations retain their existing release channel. Play
    // installations check availability on-device instead of receiving an APK.
    if (platform === 'android') return { available: true, minimumVersion: release.android, url: release.androidUrl };
    let check = storeChecks.get(app);
    if (!check || check.expires <= now()) {
      check = { expires: now() + 300000, promise: (async () => {
        try {
          const response = await fetchStore(`https://itunes.apple.com/lookup?id=${release.storeId}&country=sa`, { signal: AbortSignal.timeout(5000) });
          if (!response.ok) return { available: false, checked: false };
          const results = (await response.json()).results;
          const result = Array.isArray(results) ? results.find(item => item.bundleId === app) : null;
          if (!/^\d+(\.\d+){1,3}$/.test(String(result?.version || ''))) return { available: false, checked: false };
          return { available: true, minimumVersion: result.version, url: `https://apps.apple.com/sa/app/id${release.storeId}` };
        } catch {
          // Keep the client's previously verified requirement during an outage.
          return { available: false, checked: false };
        }
      })() };
      storeChecks.set(app, check);
    }
    return check.promise;
  };
}

export const nativeUpdatePolicy = createNativeUpdatePolicy();
