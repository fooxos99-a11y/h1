import { useCallback, useState } from 'react';
import { getTenantRegistrationNumber } from '@/services/apiBase';
import {
  readRecitationAmountsPreference,
  recitationAmountsPreferenceKey,
  writeRecitationAmountsPreference,
} from '@/lib/recitationAmountsPreference';

export default function useRecitationAmountsPreference(supervisorId) {
  const key = recitationAmountsPreferenceKey(getTenantRegistrationNumber(), supervisorId);
  const [state, setState] = useState(() => ({ key, visible: readRecitationAmountsPreference(key) }));
  const visible = state.key === key ? state.visible : readRecitationAmountsPreference(key);
  const setVisible = useCallback((nextVisible) => {
    const saved = writeRecitationAmountsPreference(key, nextVisible);
    setState({ key, visible: nextVisible });
    return saved;
  }, [key]);
  return [visible, setVisible];
}
