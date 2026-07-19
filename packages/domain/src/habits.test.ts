import { describe, expect, it } from 'vitest';

import {
  habitCompletionCount,
  habitLogIdFor,
  habitOccurrenceStatus,
  habitScheduledOn,
  habitStreak,
  habitWeeks,
  recentCalendarDates,
  recentScheduledDates,
  scheduledOn,
  withHabitSchedule,
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

  it('keeps dated schedule changes from rewriting the past', () => {
    const habit = {
      weekdays: [1, 3, 5],
      schedules: [
        { effectiveFrom: '2026-07-01', weekdays: [1, 3, 5] },
        { effectiveFrom: '2026-07-16', weekdays: [2, 4, 6] },
      ],
    };

    expect(habitScheduledOn(habit, '2026-07-15', '2026-07-01')).toBe(true);
    expect(habitScheduledOn(habit, '2026-07-17', '2026-07-01')).toBe(false);
    expect(habitScheduledOn(habit, '2026-07-18', '2026-07-01')).toBe(true);
  });

  it('starts schedule history when an existing habit first changes', () => {
    expect(
      withHabitSchedule(
        { weekdays: [1, 3, 5], schedules: [] },
        [0, 6],
        '2026-07-19',
        '2026-07-01',
      ),
    ).toEqual([
      { effectiveFrom: '2026-07-01', weekdays: [1, 3, 5] },
      { effectiveFrom: '2026-07-19', weekdays: [0, 6] },
    ]);
  });

  it('derives a rolling correction week and occurrence states', () => {
    const habit = { weekdays: [1, 3, 5] };
    const logs = [completed('2026-07-15')];

    expect(recentCalendarDates('2026-07-19', 7)).toEqual([
      '2026-07-13',
      '2026-07-14',
      '2026-07-15',
      '2026-07-16',
      '2026-07-17',
      '2026-07-18',
      '2026-07-19',
    ]);
    expect(
      habitOccurrenceStatus(
        habit,
        logs,
        '2026-07-15',
        '2026-07-19',
        '2026-07-01',
      ),
    ).toBe('completed');
    expect(
      habitOccurrenceStatus(
        habit,
        logs,
        '2026-07-17',
        '2026-07-19',
        '2026-07-01',
      ),
    ).toBe('missed');
    expect(
      habitOccurrenceStatus(
        habit,
        logs,
        '2026-07-18',
        '2026-07-19',
        '2026-07-01',
      ),
    ).toBe('unscheduled');
  });

  it('summarizes recent completions and calendar weeks', () => {
    const habit = { weekdays: [1, 3, 5] };
    const logs = [
      completed('2026-07-13'),
      completed('2026-07-15'),
      completed('2026-07-17'),
    ];

    expect(
      habitCompletionCount(habit, logs, '2026-07-19', '2026-07-01', 7),
    ).toEqual({ completed: 3, scheduled: 3 });
    expect(habitWeeks(habit, logs, '2026-07-19', '2026-07-01', 1)).toEqual([
      {
        weekStart: '2026-07-13',
        weekEnd: '2026-07-19',
        completed: 3,
        scheduled: 3,
        percentage: 100,
        isPartial: false,
      },
    ]);
  });
});
