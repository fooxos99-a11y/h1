import { useEffect, useMemo, useState } from 'react';
import { getRewardUnits } from '../../shared/reward-units.js';
import { readPublicSettingsCache } from '@/services/publicSettingsCache';

const readSummitEnabled = () => Boolean(readPublicSettingsCache()?.summitEnabled);

const useRewardUnits = (summitEnabledOverride) => {
  const [summitEnabled, setSummitEnabled] = useState(() => (
    summitEnabledOverride === undefined ? readSummitEnabled() : Boolean(summitEnabledOverride)
  ));

  useEffect(() => {
    if (summitEnabledOverride !== undefined) {
      setSummitEnabled(Boolean(summitEnabledOverride));
      return undefined;
    }
    const update = (event) => setSummitEnabled(Boolean(event.detail?.summitEnabled));
    window.addEventListener('madarij-settings-updated', update);
    return () => window.removeEventListener('madarij-settings-updated', update);
  }, [summitEnabledOverride]);

  useEffect(() => {
    document.documentElement.dataset.rewardUnit = summitEnabled ? 'kilometers' : 'points';
  }, [summitEnabled]);

  return useMemo(() => getRewardUnits(summitEnabled), [summitEnabled]);
};

export default useRewardUnits;
