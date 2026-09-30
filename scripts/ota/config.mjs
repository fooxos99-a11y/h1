import { createHash, createPublicKey } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export function normalizePublicKey(value = '') {
  const pem = value.replaceAll('\\n', '\n').trim();
  if (!pem) return '';
  const key = createPublicKey(pem);
  if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails.modulusLength < 2048) {
    throw new Error('OTA_PUBLIC_KEY must be an RSA public key of at least 2048 bits.');
  }
  return key.export({ type: 'spki', format: 'pem' }).toString();
}

export function normalizeBaseUrl(value = '') {
  if (!value) return '';
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || url.hostname.endsWith('.r2.dev')) {
    throw new Error('OTA_BASE_URL requires an HTTPS production custom domain, without credentials or query.');
  }
  return url.href.replace(/\/$/, '');
}

export function isNativeInput(file) {
  if (['capacitor.config.json', 'package-lock.json'].includes(file)) return true;
  if (file.startsWith('public/runners/')) return true;
  if (!/^(android|ios)\//.test(file)) return false;
  return !/(\/build\/|\/\.gradle\/|\/\.kotlin\/|\/public\/|\/xcuserdata\/)/.test(file)
    && !/(capacitor\.(config|plugins)\.json|capacitor\.(build|settings)\.gradle|CapApp-SPM\/Package\.swift|local\.properties|google-services\.json|GoogleService-Info\.plist)$/.test(file);
}

// Deliberately conservative: dependency-lock changes also require a new store runtime.
export function nativeFingerprint(root, settings) {
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard',
    '--', 'android', 'ios', 'public/runners', 'capacitor.config.json', 'package-lock.json'], { cwd: root })
    .toString().split('\0').filter(Boolean).filter(isNativeInput);
  const hash = createHash('sha256');
  for (const file of [...new Set(files)].sort()) {
    let content = readFileSync(path.join(root, file));
    if (/(^|\/)(gradlew|\.gitignore)$/.test(file) || /\.(json|xml|gradle|properties|java|kt|swift|plist|pbxproj|resolved|storyboard|entitlements|xcconfig|xcscheme|xcworkspacedata|pro|sh|js|md|bat)$/.test(file)) {
      content = Buffer.from(content.toString('utf8').replaceAll('\r\n', '\n'));
    }
    hash.update(`${file}\0${content.length}\0`).update(content);
  }
  hash.update(JSON.stringify(settings));
  return hash.digest('hex');
}

export function getOtaBuildConfig(root, env) {
  const baseUrl = normalizeBaseUrl(env.OTA_BASE_URL);
  const publicKey = normalizePublicKey(env.OTA_PUBLIC_KEY);
  if (Boolean(baseUrl) !== Boolean(publicKey)) throw new Error('Set both OTA_BASE_URL and OTA_PUBLIC_KEY, or neither.');
  const capacitor = JSON.parse(readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
  const settings = {
    baseUrl, publicKey, appId: capacitor.appId,
    apiBase: env.VITE_API_BASE || '', apiRoot: env.VITE_API_BASE_URL || '',
    site: env.VITE_SITE_KEY || 'madarij', base: env.BASE_URL || '/',
  };
  return { enabled: Boolean(baseUrl && publicKey), ...settings, runtime: nativeFingerprint(root, settings) };
}
