import { createReminderDocument } from '@mindfull/domain';
import { describe, expect, it } from 'vitest';

import type { LocalNotificationState } from './database';
import { reconcileReminderState } from './notifications';

const reminder = createReminderDocument({
  id: 'reminder:task:tea',
  now: '2026-07-15T10:00:00.000Z',
  deviceId: 'desktop',
  payload: {
    targetType: 'task',
    targetId: 'tea',
    scheduledAt: '2026-07-15T12:00:00.000Z',
    localTime: null,
    weekdays: null,
    enabled: true,
  },
});

describe('browser notification reconciliation', () => {
  it('records the next occurrence without asking for permission', async () => {
    expect(
      await reconcileReminderState(
        reminder,
        undefined,
        new Date('2026-07-15T11:00:00.000Z'),
        'UTC',
      ),
    ).toMatchObject({
      nextScheduledAt: '2026-07-15T12:00:00.000Z',
      activeStatus: null,
    });
  });

  it('keeps an elapsed occurrence visible in-app without permission', async () => {
    const previous: LocalNotificationState = {
      reminderId: reminder.id,
      reminderUpdatedAt: reminder.updatedAt,
      nextScheduledAt: '2026-07-15T12:00:00.000Z',
      activeOccurrenceAt: null,
      activeStatus: null,
    };

    expect(
      await reconcileReminderState(
        reminder,
        previous,
        new Date('2026-07-15T12:01:00.000Z'),
        'UTC',
      ),
    ).toMatchObject({
      nextScheduledAt: null,
      activeOccurrenceAt: '2026-07-15T12:00:00.000Z',
      activeStatus: 'due',
    });
  });

  it('catches up a one-time reminder first seen after its time', async () => {
    expect(
      await reconcileReminderState(
        reminder,
        undefined,
        new Date('2026-07-15T12:01:00.000Z'),
        'UTC',
      ),
    ).toMatchObject({
      nextScheduledAt: null,
      activeOccurrenceAt: '2026-07-15T12:00:00.000Z',
      activeStatus: 'due',
    });
  });

  it('collapses missed recurring occurrences into one quiet catch-up', async () => {
    const recurring = createReminderDocument({
      id: 'reminder:check-in:morning',
      now: '2026-07-14T06:00:00.000Z',
      deviceId: 'desktop',
      payload: {
        targetType: 'check-in',
        targetId: 'morning',
        scheduledAt: null,
        localTime: '08:00',
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        enabled: true,
      },
    });
    const previous: LocalNotificationState = {
      reminderId: recurring.id,
      reminderUpdatedAt: recurring.updatedAt,
      nextScheduledAt: '2026-07-14T08:00:00.000Z',
      activeOccurrenceAt: null,
      activeStatus: null,
    };

    expect(
      await reconcileReminderState(
        recurring,
        previous,
        new Date('2026-07-16T09:00:00.000Z'),
        'UTC',
      ),
    ).toMatchObject({
      activeOccurrenceAt: '2026-07-14T08:00:00.000Z',
      activeStatus: 'due',
      nextScheduledAt: '2026-07-17T08:00:00.000Z',
    });
  });
});
