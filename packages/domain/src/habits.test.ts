import { describe, expect, it } from 'vitest';

import {
  habitLogIdFor,
  habitStreak,
  recentScheduledDates,
  scheduledOn,
} from './habits.js';

const completed = (localDate: string) => ({
  habitId: 'habit-1',
  localDate,
  timezone: 'Asia/Kolkata',
  outcome: 'completed' as const,
  reason: null,
});

describe('habit schedules', () => {
  it('selects configured weekdays and walks scheduled occurrences', () => {
    expect(scheduledOn([1, 3, 5], '2026-07-15')).toBe(true);
    expect(scheduledOn([1, 3, 5], '2026-07-16')).toBe(false);
    expect(
      recentScheduledDates([1, 3, 5], '2026-07-17', '2026-07-01', 4),
    ).toEqual(['2026-07-17', '2026-07-15', '2026-07-13', '2026-07-10']);
    expect(habitLogIdFor('habit-1', '2026-07-15')).toBe(
      'habit-log:habit-1:2026-07-15',
    );
  });

  it('counts scheduled occurrences rather than calendar days', () => {
    expect(
      habitStreak(
        { weekdays: [1, 3, 5] },
        [completed('2026-07-10'), completed('2026-07-13')],
        '2026-07-15',
        '2026-07-01',
      ),
    ).toBe(2);
  });

  it('stops at the first past miss', () => {
    expect(
      habitStreak(
        { weekdays: [1, 3, 5] },
        [completed('2026-07-15'), completed('2026-07-10')],
        '2026-07-15',
        '2026-07-01',
      ),
    ).toBe(1);
  });
});
