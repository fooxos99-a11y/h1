import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { loadEnv } from 'vite';
import { getOtaBuildConfig } from './config.mjs';

const platform = process.argv[2];
if (platform && !['android', 'ios'].includes(platform)) throw new Error('Use android or ios.');
const configPath = 'capacitor.config.json';
const original = readFileSync(configPath, 'utf8');
const config = JSON.parse(original);
const ota = getOtaBuildConfig(process.cwd(), { ...loadEnv('mobile', process.cwd(), ''), ...process.env });
const webBuild = JSON.parse(readFileSync(`${config.webDir}/ota-build.json`, 'utf8'));
if (webBuild.runtime !== ota.runtime || webBuild.enabled !== ota.enabled) {
  throw new Error('Mobile web files do not match the native configuration. Run npm run build:mobile first.');
}
config.plugins.LiveUpdate = {
  ...config.plugins.LiveUpdate,
  defaultChannel: ota.enabled ? ota.runtime : 'ota-disabled',
  ...(ota.enabled ? { publicKey: ota.publicKey } : {}),
};
const run = (script, args) => {
  const result = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`Native preparation failed: ${script}`, { cause: result.error });
};
try {
  // Capacitor receives the pinned runtime and public key; the source config stays portable.
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  run('node_modules/@capacitor/cli/bin/capacitor', ['sync', ...(platform ? [platform] : [])]);
  if (!platform) {
    for (const target of ['android', 'ios']) run('scripts/remove-native-download-artifacts.mjs', [target]);
  }
} finally {
  writeFileSync(configPath, original);
}
console.info(`OTA native runtime: ${ota.enabled ? ota.runtime : 'disabled (hosting/key not configured)'}`);
