import { Capacitor } from '@capacitor/core';
import { KeychainAccess, SecureStorage } from '@aparajita/capacitor-secure-storage';
import { getSiteConfig } from '@/site/siteConfigs';
import { withinTimeout } from '@/lib/asyncRecovery';

const tokenKey = 'wajeh_token';
const webSessionKey = 'madarij_web_session';
const nativeSessionKey = 'madarij_native_session';
let cachedToken = null;
let secureStorageReady;
let pendingTokenRead;
let sessionVersion = 0;
const storageTimeoutMs = 4_000;
const storageUnavailableMessage = 'تعذر قراءة جلسة الدخول على الجهاز. أعد المحاولة.';

export const getAuthSessionVersion = () => sessionVersion;

const prepareSecureStorage = () => {
  if (!secureStorageReady) {
    secureStorageReady = withinTimeout(async () => {
      await SecureStorage.setKeyPrefix(getSiteConfig().secureStoragePrefix);
      await SecureStorage.setDefaultKeychainAccess(KeychainAccess.afterFirstUnlockThisDeviceOnly);
    }, storageTimeoutMs, storageUnavailableMessage).catch((error) => {
      secureStorageReady = null;
      throw error;
    });
  }
  return secureStorageReady;
};

const isNativeSession = () => Capacitor.isNativePlatform();

export const getBearerToken = async ({ fresh = false } = {}) => {
  if (!isNativeSession()) return '';
  if (!fresh && cachedToken !== null) return cachedToken;
  const version = sessionVersion;
  if (pendingTokenRead?.version === version) return pendingTokenRead.promise;
  const legacyToken = localStorage.getItem(tokenKey) || '';
  const read = async () => {
    await prepareSecureStorage();
    if (legacyToken) {
      await SecureStorage.set(tokenKey, legacyToken);
      localStorage.removeItem(tokenKey);
      return legacyToken;
    }
    return String(await withinTimeout(() => SecureStorage.get(tokenKey), storageTimeoutMs, storageUnavailableMessage) || '');
  };
  const promise = (async () => {
    let token;
    try {
      token = await read();
    } catch (error) {
      if (version !== sessionVersion) throw error;
      token = await read();
    }
    if (!token && version === sessionVersion && getAuthSessionMarker()) token = await read();
    // An empty result can be transient during native startup; do not retain it.
    if (token && version === sessionVersion) cachedToken = token;
    return token;
  })().finally(() => {
    if (pendingTokenRead?.promise === promise) pendingTokenRead = null;
  });
  pendingTokenRead = { version, promise };
  return promise;
};

export const getAuthSessionMarker = () => (
  isNativeSession()
    ? (localStorage.getItem(nativeSessionKey) || localStorage.getItem(tokenKey) || '')
    : (localStorage.getItem(webSessionKey) || '')
);

export const hasAuthSession = (role = localStorage.getItem('wajeh_role')) => (
  Boolean(role && getAuthSessionMarker())
);

export const persistAuthSession = async (token) => {
  sessionVersion += 1;
  if (isNativeSession()) {
    await prepareSecureStorage();
    if (token) await SecureStorage.set(tokenKey, token);
    else await SecureStorage.remove(tokenKey);
    cachedToken = token || '';
    localStorage.removeItem(tokenKey);
    if (token) localStorage.setItem(nativeSessionKey, '1');
    else localStorage.removeItem(nativeSessionKey);
    localStorage.removeItem(webSessionKey);
    return;
  }
  localStorage.removeItem(tokenKey);
  localStorage.removeItem(nativeSessionKey);
  localStorage.setItem(webSessionKey, '1');
};

export const clearAuthSession = async ({ afterTokenRead } = {}) => {
  sessionVersion += 1;
  const native = isNativeSession();
  cachedToken = native ? '' : cachedToken;
  localStorage.removeItem(tokenKey);
  localStorage.removeItem(nativeSessionKey);
  localStorage.removeItem(webSessionKey);
  if (native) {
    // Let logout capture the old credential before removing it from the keychain.
    try {
      if (afterTokenRead) await afterTokenRead;
    } finally {
      cachedToken = '';
      await prepareSecureStorage();
      await SecureStorage.remove(tokenKey);
    }
  }
};
