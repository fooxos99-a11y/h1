const ALLOWED_NAZEM_HOSTS = new Set([
  'nazem-plus.com',
  'api.nazem-plus.com',
]);

export function isAllowedNazemBrowserUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (['data:', 'blob:', 'about:'].includes(url.protocol)) return true;
    return ['https:', 'wss:'].includes(url.protocol) && ALLOWED_NAZEM_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export async function secureNazemBrowserContext(context) {
  await context.route('**/*', async (route) => {
    if (isAllowedNazemBrowserUrl(route.request().url())) await route.continue();
    else await route.abort('blockedbyclient');
  });
}

