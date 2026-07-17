import { Weekday } from '@capacitor/local-notifications';
import { createReminderDocument } from '@mindfull/domain';
import { describe, expect, it } from 'vitest';

import {
  nativeNotificationActions,
  nativeNotificationActionTypeId,
  nativeNotificationActionTypes,
  nativeNotificationId,
  nativeReminderSchedules,
  shouldCancelNativeNotificationState,
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

  it('keeps a delivered one-time notification until its reminder is resolved', () => {
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
    const state = {
      key: `${reminder.id}:once`,
      notificationId: 42,
      reminderId: reminder.id,
      reminderUpdatedAt: reminder.updatedAt,
      projectionVersion: 2,
    };

    expect(
      shouldCancelNativeNotificationState(
        state,
        reminder,
        new Set(),
        new Date('2026-07-15T12:01:00.000Z'),
      ),
    ).toBe(false);
    expect(
      shouldCancelNativeNotificationState(
        state,
        { ...reminder, payload: { ...reminder.payload, enabled: false } },
        new Set(),
        new Date('2026-07-15T12:01:00.000Z'),
      ),
    ).toBe(true);
    expect(
      shouldCancelNativeNotificationState(
        state,
        undefined,
        new Set(),
        new Date('2026-07-15T12:01:00.000Z'),
      ),
    ).toBe(true);
  });

  it('assigns calm actions only to habit and task reminders', () => {
    const taskReminder = createReminderDocument({
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
    const checkInReminder = createReminderDocument({
      id: 'reminder:check-in:morning',
      now: '2026-07-15T10:00:00.000Z',
      deviceId: 'phone',
      payload: {
        targetType: 'check-in',
        targetId: 'morning',
        scheduledAt: null,
        localTime: '08:00',
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        enabled: true,
      },
    });

    expect(nativeNotificationActionTypeId(recurringReminder)).toBe(
      'mindfull-habit',
    );
    expect(nativeNotificationActionTypeId(taskReminder)).toBe('mindfull-task');
    expect(nativeNotificationActionTypeId(checkInReminder)).toBeUndefined();
    expect(nativeNotificationActionTypes).toEqual([
      {
        id: 'mindfull-habit',
        actions: [
          { id: nativeNotificationActions.completeHabit, title: 'Done' },
        ],
      },
      {
        id: 'mindfull-task',
        actions: [
          { id: nativeNotificationActions.completeTask, title: 'Complete' },
          {
            id: nativeNotificationActions.snoozeTask,
            title: 'Remind me in one hour',
          },
        ],
      },
    ]);
  });
});
