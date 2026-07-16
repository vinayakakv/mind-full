import { useEffect, useState } from 'react';

export type TimeResolution = 'minute' | 'day';

export const millisecondsUntilTimeBoundary = (
  now: Date,
  resolution: TimeResolution,
): number => {
  if (resolution === 'minute') {
    return 60_000 - (now.getSeconds() * 1_000 + now.getMilliseconds());
  }

  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 0, 0);
  return tomorrow.getTime() - now.getTime();
};

export const useCurrentTime = (resolution: TimeResolution = 'minute'): Date => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timeoutId: number | undefined;

    const scheduleRefresh = () => {
      window.clearTimeout(timeoutId);
      const current = new Date();
      setNow(current);
      timeoutId = window.setTimeout(
        scheduleRefresh,
        millisecondsUntilTimeBoundary(current, resolution) + 25,
      );
    };
    const refreshWhenVisible = () => {
      if (!document.hidden) scheduleRefresh();
    };

    scheduleRefresh();
    window.addEventListener('focus', scheduleRefresh);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('focus', scheduleRefresh);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [resolution]);

  return now;
};
