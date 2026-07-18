import { useAtomValue } from 'jotai';
import { useEffect } from 'react';

import { loadAiConfiguration } from '../data/ai';
import { hasPairingToken } from '../data/sync';
import { aiStatusAtom } from '../state/ai';

export const useAiStatus = () => {
  const status = useAtomValue(aiStatusAtom);

  useEffect(() => {
    if (!hasPairingToken()) return;
    const refresh = () => void loadAiConfiguration().catch(() => undefined);
    const interval = window.setInterval(refresh, 60_000);
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  return status;
};
