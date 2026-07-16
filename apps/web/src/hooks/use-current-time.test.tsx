import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  millisecondsUntilTimeBoundary,
  useCurrentTime,
} from './use-current-time';

describe('current time', () => {
  afterEach(() => vi.useRealTimers());

  it('refreshes at the next minute boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T10:15:30.000Z'));
    const { result } = renderHook(() => useCurrentTime('minute'));

    act(() => vi.advanceTimersByTime(30_025));

    expect(result.current.toISOString()).toBe('2026-07-16T10:16:00.025Z');
  });

  it('finds the next local day boundary', () => {
    const now = new Date(2026, 6, 16, 23, 59, 59, 500);
    expect(millisecondsUntilTimeBoundary(now, 'day')).toBe(500);
  });
});
