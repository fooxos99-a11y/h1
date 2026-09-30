import { validateOtaManifest, verifyOtaEnvelope } from '../lib/otaProtocol.js';

export function createOtaUpdater({ plugin, config, fetchImpl = globalThis.fetch, storage = globalThis.localStorage }) {
  let inFlight;
  const storageKey = `ota-issued-at:${config.runtime}`;
  const check = async () => {
    if (!config.enabled) return { status: 'disabled' };
    const { channel } = await plugin.getChannel();
    if (channel !== config.runtime) return { status: 'incompatible-native' };
    const response = await fetchImpl(`${config.baseUrl}/channels/${config.runtime}/production.json`, {
      cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('OTA manifest is unavailable.');
    const body = await response.text();
    if (body.length > 20000) throw new Error('OTA manifest is too large.');
    const manifest = validateOtaManifest(
      await verifyOtaEnvelope(JSON.parse(body), config.publicKey), config,
      Number(storage.getItem(storageKey) || 0),
    );
    storage.setItem(storageKey, String(manifest.issuedAt));
    const { bundleId: current } = await plugin.getCurrentBundle();
    if (manifest.action === 'pause') {
      // Cancel a staged update while keeping the currently running bundle.
      await plugin.setNextBundle({ bundleId: current });
      return { status: 'paused' };
    }
    if (manifest.action === 'builtin') {
      await plugin.reset();
      return { status: 'builtin-staged' };
    }
    const { bundleIds: blocked } = await plugin.getBlockedBundles();
    if (blocked.includes(manifest.bundleId)) return { status: 'blocked' };
    if (current === manifest.bundleId) {
      await plugin.setNextBundle({ bundleId: current });
      return { status: 'current' };
    }
    const { bundleIds: downloaded } = await plugin.getDownloadedBundles();
    if (!downloaded.includes(manifest.bundleId)) {
      await plugin.downloadBundle({
        bundleId: manifest.bundleId, url: manifest.url, artifactType: 'zip',
        checksum: manifest.checksum, signature: manifest.signature,
      });
    }
    // No reload: activation happens on the next cold start, preserving in-progress forms.
    await plugin.setNextBundle({ bundleId: manifest.bundleId });
    return { status: 'staged', bundleId: manifest.bundleId };
  };
  return {
    check() {
      if (!inFlight) inFlight = check().finally(() => { inFlight = undefined; });
      return inFlight;
    },
  };
}
