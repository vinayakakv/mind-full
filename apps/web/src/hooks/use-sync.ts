import { useEffect } from 'react';
import { localDocumentsChanged } from '../data/events';
import { synchronize } from '../data/sync';

export const useSync = (): void => {
  useEffect(() => {
    const sync = () => void synchronize();
    const interval = window.setInterval(sync, 60_000);

    sync();
    window.addEventListener('online', sync);
    window.addEventListener('focus', sync);
    window.addEventListener(localDocumentsChanged, sync);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', sync);
      window.removeEventListener('focus', sync);
      window.removeEventListener(localDocumentsChanged, sync);
    };
  }, []);
};
