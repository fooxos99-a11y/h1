import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { appendFileSync } from 'node:fs';
import { getOtaBuildConfig } from './config.mjs';

export function validateOtaCiConfig(env, buildConfig) {
  const action = env.OTA_ACTION || 'publish';
  if (!['publish', 'validate', 'pause', 'rollback'].includes(action)) throw new Error('Invalid OTA action.');
  if (env.GITHUB_EVENT_NAME === 'push' && env.OTA_ENABLED !== 'true') {
    throw new Error('Automatic OTA is disabled: set OTA_ENABLED=true only after testing the matching native release.');
  }
  const required = ['VITE_API_BASE', 'VITE_API_BASE_URL', 'OTA_BASE_URL', 'OTA_PUBLIC_KEY'];
  if (action !== 'validate') required.push('OTA_NATIVE_RUNTIME');
  const missing = required.filter((name) => !env[name]);
  if (missing.length) throw new Error(`Missing repository variables: ${missing.join(', ')}.`);
  if (action !== 'validate' && !/^[a-f0-9]{64}$/.test(env.OTA_NATIVE_RUNTIME)) throw new Error('Invalid approved OTA_NATIVE_RUNTIME.');
  const config = buildConfig();
  if (action === 'publish' && config.runtime !== env.OTA_NATIVE_RUNTIME) {
    throw new Error('Native runtime mismatch: build and test the native release before approving its runtime. Existing devices keep their previous channel.');
  }
  return config;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = validateOtaCiConfig(process.env, () => getOtaBuildConfig(process.cwd(), process.env));
    process.stdout.write(`OTA configuration verified; candidate native runtime: ${config.runtime}\n`);
  } catch (error) {
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## OTA stopped before publishing\n\n${error.message}\n`);
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
