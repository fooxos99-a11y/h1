import { existsSync } from 'node:fs';
import { getNazemEncryptionKeyStatus } from './crypto.js';
import { secureNazemBrowserContext } from './browserSecurity.js';

async function loadBrowserRuntime() {
  try {
    const { chromium } = await import('playwright');
    const configuredPath = String(process.env.NAZEM_BROWSER_EXECUTABLE_PATH || '').trim();
    const executablePath = configuredPath || chromium.executablePath();
    return {
      chromium,
      configuredPath: Boolean(configuredPath),
      executablePath,
      ready: Boolean(executablePath && existsSync(executablePath)),
    };
  } catch {
    return { chromium: null, configuredPath: false, executablePath: '', ready: false };
  }
}

export async function getNazemRuntimeReadiness() {
  const encryption = getNazemEncryptionKeyStatus();
  const browser = await loadBrowserRuntime();
  const issues = [];
  if (!encryption.ready) issues.push(encryption.message);
  if (!browser.ready) issues.push('متصفح Chromium الخاص بعامل ناظم غير مثبت أو مساره غير صحيح.');
  return {
    ready: encryption.ready && browser.ready,
    encryptionReady: encryption.ready,
    browserReady: browser.ready,
    customBrowserConfigured: browser.configuredPath,
    issues,
  };
}

export async function probeNazemPublicLogin() {
  const browserRuntime = await loadBrowserRuntime();
  if (!browserRuntime.ready) {
    return { ok: false, code: 'NAZEM_BROWSER_MISSING' };
  }
  const browser = await browserRuntime.chromium.launch({
    headless: true,
    ...(browserRuntime.configuredPath ? { executablePath: browserRuntime.executablePath } : {}),
  });
  try {
    const context = await browser.newContext({
      locale: 'ar-SA',
      timezoneId: 'Asia/Riyadh',
      serviceWorkers: 'block',
    });
    await secureNazemBrowserContext(context);
    const page = await context.newPage();
    await page.goto('https://nazem-plus.com/login', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const username = page.locator('input[name="username"], input[autocomplete="username"], input[type="text"]');
    const password = page.locator('input[name="password"], input[autocomplete="current-password"], input[type="password"]');
    const submit = page.getByRole('button', { name: /تسجيل الدخول|دخول|login/i });
    await Promise.all([
      username.first().waitFor({ state: 'visible', timeout: 20_000 }),
      password.first().waitFor({ state: 'visible', timeout: 20_000 }),
      submit.first().waitFor({ state: 'visible', timeout: 20_000 }),
    ]);
    const [usernameFields, passwordFields, submitButtons] = await Promise.all([
      username.count(),
      password.count(),
      submit.count(),
    ]);
    return {
      ok: usernameFields === 1 && passwordFields === 1 && submitButtons === 1,
      usernameFields,
      passwordFields,
      submitButtons,
    };
  } finally {
    await browser.close();
  }
}
