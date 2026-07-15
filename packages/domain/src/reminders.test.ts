import { describe, expect, it } from 'vitest';

import { nextReminderAt, reminderIdFor } from './reminders.js';

describe('reminders', () => {
  it('uses a stable identity for one target', () => {
    expect(reminderIdFor('habit', 'walk')).toBe('reminder:habit:walk');
  });

  it('keeps a future one-time reminder and drops an elapsed one', () => {
    const reminder = {
      targetType: 'task' as const,
      targetId: 'tea',
      scheduledAt: '2026-07-15T12:00:00.000Z',
      localTime: null,
      weekdays: null,
      enabled: true,
    };

    expect(
      nextReminderAt(reminder, new Date('2026-07-15T11:00:00.000Z'), 'UTC'),
    ).toBe('2026-07-15T12:00:00.000Z');
    expect(
      nextReminderAt(reminder, new Date('2026-07-15T13:00:00.000Z'), 'UTC'),
    ).toBeNull();
  });

  it('finds the next scheduled local occurrence across a timezone', () => {
    const reminder = {
      targetType: 'habit' as const,
      targetId: 'walk',
      scheduledAt: null,
      localTime: '07:30',
      weekdays: [1, 3, 5],
      enabled: true,
    };

    expect(
      nextReminderAt(
        reminder,
        new Date('2026-07-15T03:00:00.000Z'),
        'Asia/Kolkata',
      ),
    ).toBe('2026-07-17T02:00:00.000Z');
  });

  it('does not schedule a disabled reminder', () => {
    expect(
      nextReminderAt(
        {
          targetType: 'check-in',
          targetId: 'morning',
          scheduledAt: null,
          localTime: '08:00',
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          enabled: false,
        },
        new Date('2026-07-15T00:00:00.000Z'),
        'UTC',
      ),
    ).toBeNull();
  });
});
