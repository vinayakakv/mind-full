import { useEffect } from 'react';

import { removeExpiredCompletedTasks } from '../data/documents';
import { documentsChanged } from '../data/events';

export const useHousekeeping = (): void => {
  useEffect(() => {
    let isRunning = false;

    const run = async () => {
      if (isRunning) return;
      isRunning = true;
      try {
        await removeExpiredCompletedTasks();
      } finally {
        isRunning = false;
      }
    };
    const runWhenVisible = () => {
      if (document.visibilityState === 'visible') void run();
    };

    void run();
    document.addEventListener('visibilitychange', runWhenVisible);
    window.addEventListener(documentsChanged, run);

    return () => {
      document.removeEventListener('visibilitychange', runWhenVisible);
      window.removeEventListener(documentsChanged, run);
    };
  }, []);
};
