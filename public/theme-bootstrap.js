(() => {
  const base = (globalThis.document.currentScript?.dataset.base || '').replace(/\/$/, '');
  const pathname = globalThis.location.pathname;
  const route = base && pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname;
  const scope = /^\/(dashboard|portal)(\/|$)/.test(route) ? 'account' : 'public';
  let preference;
  try {
    preference = globalThis.localStorage.getItem(`madarij_theme_${scope}`);
  } catch {
    preference = null;
  }
  const theme = route === '/' || /^\/login\/?$/.test(route) ? 'light'
    : preference === 'light' || preference === 'dark'
      ? preference : scope === 'account' ? 'light' : 'dark';
  globalThis.document.documentElement.classList.add(theme);
  globalThis.document.documentElement.style.colorScheme = theme;
})();
