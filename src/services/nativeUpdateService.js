import { getApiBase } from '@/services/apiBase';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { resolveNativeUpdateRequirement } from '../../shared/native-update';

const nativeUpdate = registerPlugin('NativeUpdate');

async function readNativeUpdatePolicy(info, platform) {
  if (platform === 'android' && Capacitor.isPluginAvailable('NativeUpdate')) {
    const play = await nativeUpdate.check();
    // A Play installation never falls back to a separately signed APK.
    if (play.channel === 'google-play') return play;
  }
  const response = await fetch(`${getApiBase()}/native-update?app=${encodeURIComponent(info.id)}&platform=${encodeURIComponent(platform)}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('تعذر التحقق من تحديث التطبيق');
  return response.json();
}

export function getCachedRequiredNativeUpdate(info, platform) {
  const key = `native-required-update:${info.id}:${platform}`;
  try { return resolveNativeUpdateRequirement(info, null, JSON.parse(localStorage.getItem(key))); }
  catch { return null; }
}

export async function getRequiredNativeUpdate(info, platform) {
  const key = `native-required-update:${info.id}:${platform}`;
  const saved = getCachedRequiredNativeUpdate(info, platform);
  let policy;
  try { policy = await readNativeUpdatePolicy(info, platform); }
  catch (error) {
    const cached = resolveNativeUpdateRequirement(info, null, saved);
    if (cached) return cached;
    throw error;
  }
  const required = resolveNativeUpdateRequirement(info, policy, saved);
  try {
    if (required) localStorage.setItem(key, JSON.stringify(required));
    else if (policy?.checked !== false) localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable; the verified requirement still blocks this session.
  }
  return required;
}
