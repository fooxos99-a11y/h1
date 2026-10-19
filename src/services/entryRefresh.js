import { getBearerToken, hasAuthSession } from '@/lib/authSession';
import { retryTemporaryRead } from '@/lib/asyncRecovery';
import { probeServerConnectivity } from '@/hooks/useOnlineStatus';
import { advanceEntryRefreshVersion } from '@/lib/entryRefreshVersion';

export async function refreshAppEntry() {
  if (navigator.onLine === false) throw new Error('يلزم الاتصال بالإنترنت لفتح التطبيق.');
  if (hasAuthSession()) await getBearerToken({ fresh: true });
  await retryTemporaryRead(async () => {
    if (!await probeServerConnectivity()) throw new Error('تعذر الاتصال بالخادم. أعد المحاولة.');
  });
  advanceEntryRefreshVersion();
}
