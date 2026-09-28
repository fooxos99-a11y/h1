export function versionIsOlder(current, minimum) {
  if (![current, minimum].every(value => /^\d+(\.\d+){1,3}$/.test(String(value)))) return false;
  const a = String(current).split('.').map(Number), b = String(minimum).split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) < (b[i] || 0);
  }
  return false;
}

export function requiredNativeUpdate(info, policy) {
  if (!policy?.available || !String(policy.url).startsWith('https://')) return null;
  if (policy.minimumBuild != null) {
    const current = Number(info.build), minimum = Number(policy.minimumBuild);
    return Number.isSafeInteger(current) && current > 0 && Number.isSafeInteger(minimum) && minimum > current ? policy : null;
  }
  return versionIsOlder(info.version, policy.minimumVersion) ? policy : null;
}

// A store/network failure must not dismiss a mandatory update already verified
// for this installation. Updating the app itself satisfies the saved policy.
export function resolveNativeUpdateRequirement(info, policy, saved) {
  return policy?.checked === false || policy == null
    ? requiredNativeUpdate(info, saved)
    : requiredNativeUpdate(info, policy);
}
