import { createHash, createPublicKey, sign, verify } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { finished } from 'node:stream/promises';
import path from 'node:path';
import { ZipArchive } from 'archiver';
import { normalizePublicKey } from './config.mjs';

export function signEnvelope(payload, privateKey) {
  const text = JSON.stringify(payload);
  return { payload: text, signature: sign('sha256', Buffer.from(text), privateKey).toString('base64') };
}

export function checkSigningKey(privateKey, expectedPublicKey) {
  if (!privateKey || normalizePublicKey(createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString()) !== expectedPublicKey) {
    throw new Error('OTA_SIGNING_PRIVATE_KEY does not match the public key in the native build.');
  }
}

export function readSignedEnvelope(envelope, publicKey) {
  if (typeof envelope?.payload !== 'string' || typeof envelope.signature !== 'string'
    || !verify('sha256', Buffer.from(envelope.payload), publicKey, Buffer.from(envelope.signature, 'base64'))) {
    throw new Error('Untrusted OTA release metadata.');
  }
  return JSON.parse(envelope.payload);
}

export async function listWebFiles(root, directory = '') {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const nestedFiles = await Promise.all(entries.map(async (entry) => {
    const name = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink() || entry.name.startsWith('.')
      || /\.(apk|aab|ipa|dex|jar|so|swift|kt|java|pem|key|p12|p8|map)$/i.test(entry.name)
      || /^(downloads|node_modules|server)(\/|$)/.test(name)) {
      throw new Error(`Non-web or sensitive file in OTA build: ${name}`);
    }
    if (entry.isDirectory()) return listWebFiles(root, name);
    if (entry.isFile()) return [name];
    throw new Error(`Unsupported OTA file: ${name}`);
  }));
  const files = nestedFiles.flat();
  return files.sort((first, second) => first < second ? -1 : Number(first > second));
}

export async function packageWebBundle(webDir, outputFile, config, privateKey) {
  checkSigningKey(privateKey, config.publicKey);
  const build = JSON.parse(await readFile(path.join(webDir, 'ota-build.json'), 'utf8'));
  if (!build.enabled || build.runtime !== config.runtime || build.publicKey !== config.publicKey || build.baseUrl !== config.baseUrl) {
    throw new Error('Build metadata does not match the approved native runtime. Rebuild the mobile web bundle.');
  }
  const files = await listWebFiles(webDir);
  if (!files.includes('index.html')) throw new Error('The OTA bundle requires index.html at its root.');
  await mkdir(path.dirname(outputFile), { recursive: true });
  const output = createWriteStream(outputFile);
  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on('warning', (error) => output.destroy(error));
  archive.on('error', (error) => output.destroy(error));
  archive.pipe(output);
  const completion = finished(output);
  for (const name of files) archive.file(path.join(webDir, name), { name, date: new Date('2020-01-01T00:00:00Z'), mode: 0o644 });
  await Promise.all([archive.finalize(), completion]);
  const hash = createHash('sha256');
  const signer = (await import('node:crypto')).createSign('sha256');
  for await (const chunk of createReadStream(outputFile)) { hash.update(chunk); signer.update(chunk); }
  const checksum = hash.digest('hex');
  return {
    schema: 1, action: 'update', appId: config.appId, runtime: config.runtime,
    bundleId: checksum, checksum, signature: signer.sign(privateKey, 'base64'),
    url: `${config.baseUrl}/bundles/${config.runtime}/${checksum}.zip`,
  };
}

export async function publishPointer(store, manifest, privateKey, publicKey) {
  const key = `channels/${manifest.runtime}/production.json`;
  const previous = await store.get(key);
  let previousTime = 0;
  if (previous) {
    const old = readSignedEnvelope(JSON.parse(previous.body), publicKey);
    if (old.runtime !== manifest.runtime || old.appId !== manifest.appId) throw new Error('Unexpected OTA channel identity.');
    previousTime = old.issuedAt;
  }
  const payload = { ...manifest, issuedAt: Math.max(Date.now(), previousTime + 1) };
  await store.put(key, JSON.stringify(signEnvelope(payload, privateKey)), {
    contentType: 'application/json', cacheControl: 'no-store, max-age=0',
    ...(previous ? { ifMatch: previous.etag } : { ifNoneMatch: '*' }),
  });
  return payload;
}
