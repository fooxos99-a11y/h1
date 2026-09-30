import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { loadEnv } from 'vite';
import { getOtaBuildConfig, normalizeBaseUrl, normalizePublicKey } from './config.mjs';
import { checkSigningKey, packageWebBundle, publishPointer, readSignedEnvelope, signEnvelope } from './release.mjs';
import { validateOtaManifest } from '../../src/lib/otaProtocol.js';

const env = { ...loadEnv('mobile', process.cwd(), ''), ...process.env };
const action = process.argv[2];
if (!['publish', 'pause', 'rollback'].includes(action)) throw new Error('Use publish, pause, or rollback.');
for (const name of ['OTA_BASE_URL', 'OTA_PUBLIC_KEY', 'OTA_NATIVE_RUNTIME', 'OTA_SIGNING_PRIVATE_KEY',
  'OTA_R2_ACCOUNT_ID', 'OTA_R2_BUCKET', 'OTA_R2_ACCESS_KEY_ID', 'OTA_R2_SECRET_ACCESS_KEY']) {
  if (!env[name]) throw new Error(`Missing ${name}.`);
}
if (!/^[a-f0-9]{32}$/.test(env.OTA_R2_ACCOUNT_ID) || !/^[a-f0-9]{64}$/.test(env.OTA_NATIVE_RUNTIME)) {
  throw new Error('Invalid R2 account or approved OTA runtime.');
}
const privateKey = env.OTA_SIGNING_PRIVATE_KEY.replaceAll('\\n', '\n');
const config = {
  appId: JSON.parse(await readFile('capacitor.config.json', 'utf8')).appId,
  runtime: env.OTA_NATIVE_RUNTIME,
  baseUrl: normalizeBaseUrl(env.OTA_BASE_URL), publicKey: normalizePublicKey(env.OTA_PUBLIC_KEY),
};
checkSigningKey(privateKey, config.publicKey);
const client = new S3Client({
  region: 'auto', endpoint: `https://${env.OTA_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.OTA_R2_ACCESS_KEY_ID, secretAccessKey: env.OTA_R2_SECRET_ACCESS_KEY },
});
const store = {
  async get(key) {
    try {
      const result = await client.send(new GetObjectCommand({ Bucket: env.OTA_R2_BUCKET, Key: key }));
      return { body: await result.Body.transformToString(), etag: result.ETag };
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) return null;
      throw error;
    }
  },
  async put(key, body, options) {
    await client.send(new PutObjectCommand({
      Bucket: env.OTA_R2_BUCKET, Key: key, Body: body,
      ContentType: options.contentType, CacheControl: options.cacheControl,
      IfMatch: options.ifMatch, IfNoneMatch: options.ifNoneMatch,
      ContentLength: options.contentLength,
    }));
  },
};
let manifest;
if (action === 'publish') {
  const buildConfig = getOtaBuildConfig(process.cwd(), env);
  if (buildConfig.runtime !== config.runtime) {
    throw new Error('Native inputs changed or no approved native release exists. Ship/test a store release before approving this runtime.');
  }
  const file = 'dist/ota/bundle.zip';
  manifest = await packageWebBundle('dist/madarij-mobile', file, { ...config, enabled: true }, privateKey);
  const key = `bundles/${config.runtime}/${manifest.bundleId}.zip`;
  try {
    await store.put(key, createReadStream(file), {
      contentType: 'application/zip', cacheControl: 'public, max-age=31536000, immutable',
      contentLength: (await stat(file)).size, ifNoneMatch: '*',
    });
  } catch (error) {
    if (error.$metadata?.httpStatusCode !== 412) throw error;
    // Content-addressed objects are immutable; a previous identical upload is safe to reuse.
  }
  const issuedAt = Date.now();
  await store.put(`releases/${config.runtime}/${manifest.bundleId}.json`, JSON.stringify(signEnvelope({ ...manifest, issuedAt }, privateKey)), {
    contentType: 'application/json', cacheControl: 'no-store',
  });
} else if (action === 'rollback' && env.OTA_BUNDLE_ID !== 'builtin') {
  if (!/^[a-f0-9]{64}$/.test(env.OTA_BUNDLE_ID || '')) throw new Error('Set OTA_BUNDLE_ID to an existing bundle hash or builtin.');
  const release = await store.get(`releases/${config.runtime}/${env.OTA_BUNDLE_ID}.json`);
  if (!release) throw new Error('Requested release does not exist in this runtime.');
  manifest = readSignedEnvelope(JSON.parse(release.body), config.publicKey);
  validateOtaManifest(manifest, config);
  if (manifest.bundleId !== env.OTA_BUNDLE_ID || manifest.action !== 'update') throw new Error('Invalid rollback release.');
} else {
  manifest = { schema: 1, appId: config.appId, runtime: config.runtime, action: action === 'pause' ? 'pause' : 'builtin' };
}
// Verify public delivery before pointing devices at a bundle. No R2 credentials go to this URL.
if (manifest.action === 'update') {
  const response = await fetch(manifest.url, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('The bundle is not reachable through the configured public HTTPS domain.');
}
const result = await publishPointer(store, manifest, privateKey, config.publicKey);
console.info(`OTA ${result.action}: runtime=${result.runtime}, bundle=${result.bundleId || 'none'}`);
