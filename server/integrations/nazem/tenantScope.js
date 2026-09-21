import { siteName } from '../../siteConfig.js';

export function buildNazemTenantScope(rows, defaultDatabase) {
  const defaultTenant = {
    registrationNumber: '',
    name: siteName,
    databaseName: defaultDatabase,
  };
  const seenDatabases = new Set();

  return [defaultTenant, ...(Array.isArray(rows) ? rows : [])].filter((tenant) => {
    const databaseName = String(tenant?.databaseName || '').trim();
    if (!databaseName || seenDatabases.has(databaseName)) return false;
    seenDatabases.add(databaseName);
    return true;
  });
}
