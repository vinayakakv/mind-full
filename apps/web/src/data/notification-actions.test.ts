import type { LocalNotificationSchema } from '@capacitor/local-notifications';
import { habitLogIdFor } from '@mindfull/domain';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { database, type LocalNotificationState } from './database';
import { createHabit, setHabitCompleted } from './habits';
import {
  type NativeNotificationAction,
  nativeNotificationActions,
} from './native-notifications';
import {
  applyNativeNotificationAction,
  loadReminderNotices,
} from './notifications';
import { addTask } from './tasks';
import { localDateFor } from './time';

const actionFor = (
  actionId: string,
  reminderId: string,
): NativeNotificationAction => ({
  actionId,
  notification: {
    id: 42,
    title: 'A gentle reminder',
    body: 'Something worth remembering',
    extra: { reminderId },
  } satisfies LocalNotificationSchema,
});

const dueStateFor = (reminderId: string): LocalNotificationState => ({
  reminderId,
  reminderUpdatedAt: '2026-07-17T08:00:00.000Z',
  nextScheduledAt: null,
  activeOccurrenceAt: '2026-07-17T08:00:00.000Z',
  activeStatus: 'due',
});

describe('native notification actions', () => {
  beforeEach(async () => {
    await database.delete();
    await database.open();
    window.localStorage.clear();
  });

  afterAll(() => database.close());

  it('completes a task, disables its reminder, and hides its home notice', async () => {
    const task = await addTask(
      'Call the insurance company',
      '2030-07-17T12:00:00.000Z',
    );
    const reminderId = `reminder:task:${task.id}`;
    await database.notificationState.put(dueStateFor(reminderId));

    expect(await loadReminderNotices()).toHaveLength(1);
    await applyNativeNotificationAction(
      actionFor(nativeNotificationActions.completeTask, reminderId),
      new Date('2030-07-17T12:00:00.000Z'),
    );

    expect(await database.documents.get(task.id)).toMatchObject({
      payload: { completedAt: expect.any(String) },
    });
    expect(await database.documents.get(reminderId)).toMatchObject({
      payload: { enabled: false },
    });
    expect(await database.notificationState.get(reminderId)).toMatchObject({
      activeOccurrenceAt: null,
      activeStatus: null,
    });
    expect(await loadReminderNotices()).toEqual([]);
  });

  it('snoozes a task and its reminder together for one hour', async () => {
    const task = await addTask(
      'Put the library book by the door',
      '2030-07-17T12:00:00.000Z',
    );
    const reminderId = `reminder:task:${task.id}`;
    await database.notificationState.put(dueStateFor(reminderId));

    await applyNativeNotificationAction(
      actionFor(nativeNotificationActions.snoozeTask, reminderId),
      new Date('2030-07-17T12:05:00.000Z'),
    );

    expect(await database.documents.get(task.id)).toMatchObject({
      payload: { reminderAt: '2030-07-17T13:05:00.000Z' },
    });
    expect(await database.documents.get(reminderId)).toMatchObject({
      payload: {
        enabled: true,
        scheduledAt: '2030-07-17T13:05:00.000Z',
      },
    });
    expect(await database.notificationState.get(reminderId)).toMatchObject({
      activeStatus: null,
    });
  });

  it('records a habit completion for the action date', async () => {
    const habit = await createHabit({
      name: 'Take a short walk',
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      reminderTime: '08:00',
    });
    const reminderId = `reminder:habit:${habit.id}`;
    const actionAt = new Date('2030-07-17T08:05:00.000Z');
    const localDate = localDateFor(actionAt);
    await database.notificationState.put(dueStateFor(reminderId));

    await applyNativeNotificationAction(
      actionFor(nativeNotificationActions.completeHabit, reminderId),
      actionAt,
    );

    expect(
      await database.documents.get(habitLogIdFor(habit.id, localDate)),
    ).toMatchObject({
      payload: {
        habitId: habit.id,
        localDate,
        outcome: 'completed',
      },
    });
    expect(await database.notificationState.get(reminderId)).toMatchObject({
      activeStatus: null,
    });
  });

  it('hides a habit notice once today is completed in the app', async () => {
    const habit = await createHabit({
      name: 'Take a short walk',
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      reminderTime: '08:00',
    });
    const reminderId = `reminder:habit:${habit.id}`;
    const localDate = localDateFor(new Date());
    await database.notificationState.put(dueStateFor(reminderId));

    expect(await loadReminderNotices()).toHaveLength(1);
    await setHabitCompleted(habit.id, localDate, true);

    expect(await loadReminderNotices()).toEqual([]);
    expect(await database.notificationState.get(reminderId)).toMatchObject({
      activeStatus: null,
    });
  });

  it('ignores an action without a valid reminder reference', async () => {
    const result = await applyNativeNotificationAction({
      actionId: nativeNotificationActions.completeTask,
      notification: {
        id: 7,
        title: 'Reminder',
        body: 'Missing context',
      },
    });

    expect(result).toBeNull();
  });
});
