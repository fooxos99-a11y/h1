export const RAWASI_ANDROID_APK_URL = '/downloads/rawasi-android-1.0.24.apk';
export const RAWASI_APP_STORE_URL = 'https://apps.apple.com/sa/app/id6798071538';

export const getDownloadPlatformLinks = (site = {}) => ({
  android: site.androidDownloadUrl || RAWASI_ANDROID_APK_URL,
  ios: site.appStoreUrl || '',
});

export function detectDownloadPlatform(userAgent = '', maxTouchPoints = 0) {
  const normalized = String(userAgent || '');
  if (/Android/i.test(normalized)) return 'android';
  if (/iPhone|iPad|iPod/i.test(normalized) || (/Macintosh/i.test(normalized) && Number(maxTouchPoints) > 1)) return 'ios';
  return 'other';
}
