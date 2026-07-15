import { Weekday } from '@capacitor/local-notifications';
import { createReminderDocument } from '@mindfull/domain';
import { describe, expect, it } from 'vitest';

import {
  nativeNotificationId,
  nativeReminderSchedules,
} from './native-notifications';

const recurringReminder = createReminderDocument({
  id: 'reminder:habit:walk',
  now: '2026-07-15T10:00:00.000Z',
  deviceId: 'phone',
  payload: {
    targetType: 'habit',
    targetId: 'walk',
    scheduledAt: null,
    localTime: '07:30',
    weekdays: [1, 3, 5],
    enabled: true,
  },
});

describe('native reminder projection', () => {
  it('creates one stable weekly schedule for each selected weekday', () => {
    expect(nativeReminderSchedules(recurringReminder)).toEqual([
      {
        key: `${recurringReminder.id}:weekday:1`,
        schedule: {
          on: { weekday: Weekday.Monday, hour: 7, minute: 30 },
          allowWhileIdle: true,
        },
      },
      {
        key: `${recurringReminder.id}:weekday:3`,
        schedule: {
          on: { weekday: Weekday.Wednesday, hour: 7, minute: 30 },
          allowWhileIdle: true,
        },
      },
      {
        key: `${recurringReminder.id}:weekday:5`,
        schedule: {
          on: { weekday: Weekday.Friday, hour: 7, minute: 30 },
          allowWhileIdle: true,
        },
      },
    ]);
  });

  it('keeps a future one-time schedule and ignores an elapsed one', () => {
    const reminder = createReminderDocument({
      id: 'reminder:task:tea',
      now: '2026-07-15T10:00:00.000Z',
      deviceId: 'phone',
      payload: {
        targetType: 'task',
        targetId: 'tea',
        scheduledAt: '2026-07-15T12:00:00.000Z',
        localTime: null,
        weekdays: null,
        enabled: true,
      },
    });

    expect(
      nativeReminderSchedules(reminder, new Date('2026-07-15T11:00:00.000Z')),
    ).toEqual([
      {
        key: `${reminder.id}:once`,
        schedule: {
          at: new Date('2026-07-15T12:00:00.000Z'),
          allowWhileIdle: true,
        },
      },
    ]);
    expect(
      nativeReminderSchedules(reminder, new Date('2026-07-15T12:01:00.000Z')),
    ).toEqual([]);
  });

  it('allocates stable positive Android IDs and avoids known collisions', () => {
    const first = nativeNotificationId('reminder:task:tea:once');
    expect(first).toBeGreaterThan(0);
    expect(nativeNotificationId('reminder:task:tea:once')).toBe(first);
    expect(
      nativeNotificationId('reminder:task:tea:once', new Set([first])),
    ).not.toBe(first);
  });
});
