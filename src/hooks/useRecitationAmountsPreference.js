import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { getTenantRegistrationNumber } from '@/services/apiBase';
import { offlineRecitationStore } from '@/services/offlineRecitationStore';
import {
  readNativeRecitationAmountsPreference,
  readRecitationAmountsPreference,
  recitationAmountsPreferenceKey,
  writeNativeRecitationAmountsPreference,
  writeRecitationAmountsPreference,
} from '@/lib/recitationAmountsPreference';

export default function useRecitationAmountsPreference(supervisorId) {
  const key = recitationAmountsPreferenceKey(getTenantRegistrationNumber(), supervisorId);
  const [state, setState] = useState(() => ({ key, visible: readRecitationAmountsPreference(key) }));
  const revision = useRef(0);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let active = true;
    const currentRevision = ++revision.current;
    void readNativeRecitationAmountsPreference(key, offlineRecitationStore).then((visible) => {
      if (active && revision.current === currentRevision) setState({ key, visible });
    });
    return () => { active = false; };
  }, [key]);
  const visible = state.key === key ? state.visible : readRecitationAmountsPreference(key);
  const setVisible = useCallback(async (nextVisible) => {
    const currentRevision = ++revision.current;
    const saved = Capacitor.isNativePlatform()
      ? await writeNativeRecitationAmountsPreference(key, nextVisible, offlineRecitationStore)
      : writeRecitationAmountsPreference(key, nextVisible);
    if (revision.current === currentRevision) setState({ key, visible: nextVisible });
    return saved;
  }, [key]);
  return [visible, setVisible];
}
