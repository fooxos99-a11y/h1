import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('.signing/ota', { recursive: true });
if (existsSync('.signing/ota/private.pem') || existsSync('.signing/ota/public.pem')) {
  throw new Error('OTA key files already exist. Keep the existing trusted key pair.');
}
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
// Exclusive creation prevents accidental replacement of the key trusted by installed apps.
writeFileSync('.signing/ota/private.pem', privateKey, { flag: 'wx', mode: 0o600 });
writeFileSync('.signing/ota/public.pem', publicKey, { flag: 'wx' });
console.info('Created .signing/ota/private.pem and public.pem. Keep the private key out of Git.');
