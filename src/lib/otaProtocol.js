const HASH = /^[a-f0-9]{64}$/;
const SIGNATURE = /^[A-Za-z0-9+/]+={0,2}$/;
const bytes = (base64) => Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));

export async function verifyOtaEnvelope(envelope, publicKey, subtle = globalThis.crypto.subtle) {
  if (typeof envelope?.payload !== 'string' || envelope.payload.length > 12000
    || typeof envelope.signature !== 'string' || !SIGNATURE.test(envelope.signature)) {
    throw new Error('Invalid OTA manifest envelope.');
  }
  const der = publicKey.replace(/-----[^-]+-----|\s/g, '');
  const key = await subtle.importKey('spki', bytes(der), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await subtle.verify('RSASSA-PKCS1-v1_5', key, bytes(envelope.signature), new TextEncoder().encode(envelope.payload));
  if (!valid) throw new Error('Invalid OTA manifest signature.');
  return JSON.parse(envelope.payload);
}

export function validateOtaManifest(manifest, config, lastIssuedAt = 0, now = Date.now()) {
  if (manifest?.schema !== 1 || manifest.appId !== config.appId || manifest.runtime !== config.runtime
    || !HASH.test(manifest.runtime) || !Number.isSafeInteger(manifest.issuedAt)
    || manifest.issuedAt < lastIssuedAt || manifest.issuedAt > now + 300000
    || !['update', 'pause', 'builtin'].includes(manifest.action)) {
    throw new Error('Invalid or incompatible OTA manifest.');
  }
  if (manifest.action !== 'update') return manifest;
  if (!HASH.test(manifest.bundleId) || manifest.checksum !== manifest.bundleId
    || typeof manifest.signature !== 'string' || !SIGNATURE.test(manifest.signature)) {
    throw new Error('Invalid OTA bundle identity.');
  }
  const expected = `${config.baseUrl}/bundles/${config.runtime}/${manifest.bundleId}.zip`;
  if (manifest.url !== expected) throw new Error('OTA bundle URL is outside the configured runtime.');
  return manifest;
}
