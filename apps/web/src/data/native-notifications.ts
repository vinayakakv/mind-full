import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import {
  type ActionPerformed,
  type ActionType,
  type LocalNotificationSchema,
  LocalNotifications,
  type PermissionStatus,
  type Schedule,
  type SettingsPermissionStatus,
  type Weekday,
} from '@capacitor/local-notifications';
import type { ReminderDocument } from '@mindfull/domain';

import { database, type NativeNotificationState } from './database';

const channelId = 'mindfull-reminders';
const notificationProjectionVersion = 2;

export const nativeNotificationActions = {
  tap: 'tap',
  completeHabit: 'complete-habit',
  completeTask: 'complete-task',
  snoozeTask: 'snooze-task',
} as const;

const habitActionTypeId = 'mindfull-habit';
const taskActionTypeId = 'mindfull-task';

export const nativeNotificationActionTypes: ActionType[] = [
  {
    id: habitActionTypeId,
    actions: [{ id: nativeNotificationActions.completeHabit, title: 'Done' }],
  },
  {
    id: taskActionTypeId,
    actions: [
      { id: nativeNotificationActions.completeTask, title: 'Complete' },
      {
        id: nativeNotificationActions.snoozeTask,
        title: 'Remind me in one hour',
      },
    ],
  },
];

export type NativeNotificationAction = ActionPerformed;

export type NotificationCopy = {
  title: string;
  body: string;
};

export type NativeSchedule = {
  key: string;
  schedule: Schedule;
};

export const hasNativeNotifications = (): boolean =>
  Capacitor.isNativePlatform();

export const hasNativeExactAlarms = (): boolean =>
  Capacitor.getPlatform() === 'android';

export const nativeNotificationActionTypeId = (
  reminder: ReminderDocument,
): string | undefined => {
  if (reminder.payload.targetType === 'habit') return habitActionTypeId;
  if (reminder.payload.targetType === 'task') return taskActionTypeId;
  return undefined;
};

export const startNativeNotificationActions = async (
  onAction: (action: NativeNotificationAction) => void,
): Promise<PluginListenerHandle> => {
  await LocalNotifications.registerActionTypes({
    types: nativeNotificationActionTypes,
  });
  return LocalNotifications.addListener(
    'localNotificationActionPerformed',
    onAction,
  );
};

export const nativeReminderSchedules = (
  reminder: ReminderDocument,
  now = new Date(),
): NativeSchedule[] => {
  if (!reminder.payload.enabled) return [];

  if (reminder.payload.scheduledAt) {
    const at = new Date(reminder.payload.scheduledAt);
    return at > now
      ? [
          {
            key: `${reminder.id}:once`,
            schedule: { at, allowWhileIdle: true },
          },
        ]
      : [];
  }

  if (!reminder.payload.localTime || !reminder.payload.weekdays) return [];

  const [hour, minute] = reminder.payload.localTime.split(':').map(Number);
  return reminder.payload.weekdays.map((weekday) => ({
    key: `${reminder.id}:weekday:${weekday}`,
    schedule: {
      on: { weekday: (weekday + 1) as Weekday, hour, minute },
      allowWhileIdle: true,
    },
  }));
};

export const nativeNotificationId = (
  key: string,
  usedIds: ReadonlySet<number> = new Set(),
): number => {
  let hash = 2_166_136_261;
  for (const character of key) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619);
  }

  let candidate = (hash >>> 0) & 0x7fffffff;
  if (candidate === 0) candidate = 1;
  while (usedIds.has(candidate)) {
    candidate = candidate === 0x7fffffff ? 1 : candidate + 1;
  }
  return candidate;
};

export const shouldCancelNativeNotificationState = (
  state: NativeNotificationState,
  reminder: ReminderDocument | undefined,
  desiredKeys: ReadonlySet<string>,
  now: Date,
): boolean => {
  if (desiredKeys.has(state.key)) return false;
  if (!reminder?.payload.enabled) return true;

  const scheduledAt = reminder.payload.scheduledAt;
  const isDeliveredOneTimeNotification =
    state.key === `${reminder.id}:once` &&
    scheduledAt !== null &&
    scheduledAt <= now.toISOString();

  return !isDeliveredOneTimeNotification;
};

const ensureChannel = async (): Promise<void> => {
  if (Capacitor.getPlatform() !== 'android') return;

  await LocalNotifications.createChannel({
    id: channelId,
    name: 'Gentle reminders',
    description: 'Mindfull habits, tasks, and check-ins',
    importance: 3,
    visibility: 1,
  });
};

export const nativeNotificationPermission = (): Promise<PermissionStatus> =>
  LocalNotifications.checkPermissions();

export const requestNativeNotificationPermission =
  (): Promise<PermissionStatus> => LocalNotifications.requestPermissions();

export const nativeExactAlarmPermission =
  (): Promise<SettingsPermissionStatus> =>
    LocalNotifications.checkExactNotificationSetting();

export const requestNativeExactAlarmPermission =
  (): Promise<SettingsPermissionStatus> =>
    LocalNotifications.changeExactNotificationSetting();

const notificationFor = (
  reminder: ReminderDocument,
  state: NativeNotificationState,
  copy: NotificationCopy,
  schedule: Schedule,
): LocalNotificationSchema => {
  const actionTypeId = nativeNotificationActionTypeId(reminder);

  return {
    id: state.notificationId,
    title: copy.title,
    body: copy.body,
    schedule,
    channelId,
    autoCancel: true,
    ...(actionTypeId ? { actionTypeId } : {}),
    extra: { reminderId: state.reminderId },
  };
};

export const reconcileNativeNotifications = async (
  reminders: ReminderDocument[],
  copyFor: (reminder: ReminderDocument) => Promise<NotificationCopy>,
): Promise<void> => {
  if (!hasNativeNotifications()) return;

  const permission = await nativeNotificationPermission();
  if (permission.display !== 'granted') return;

  await ensureChannel();
  const now = new Date();
  const [storedStates, pending] = await Promise.all([
    database.nativeNotificationState.toArray(),
    LocalNotifications.getPending(),
  ]);
  const pendingIds = new Set(pending.notifications.map(({ id }) => id));
  const usedIds = new Set(
    storedStates.map(({ notificationId }) => notificationId),
  );
  const desired = reminders.flatMap((reminder) =>
    nativeReminderSchedules(reminder, now).map((nativeSchedule) => ({
      reminder,
      ...nativeSchedule,
    })),
  );
  const desiredKeys = new Set(desired.map(({ key }) => key));
  const remindersById = new Map(
    reminders.map((reminder) => [reminder.id, reminder]),
  );
  const staleStates = storedStates.filter((state) =>
    shouldCancelNativeNotificationState(
      state,
      remindersById.get(state.reminderId),
      desiredKeys,
      now,
    ),
  );

  if (staleStates.length) {
    await LocalNotifications.cancel({
      notifications: staleStates.map(({ notificationId }) => ({
        id: notificationId,
      })),
    });
    await database.nativeNotificationState.bulkDelete(
      staleStates.map(({ key }) => key),
    );
  }

  for (const { key, reminder, schedule } of desired) {
    const stored = storedStates.find((state) => state.key === key);
    if (
      stored?.reminderUpdatedAt === reminder.updatedAt &&
      stored.projectionVersion === notificationProjectionVersion &&
      pendingIds.has(stored.notificationId)
    ) {
      continue;
    }

    const state: NativeNotificationState = {
      key,
      notificationId:
        stored?.notificationId ?? nativeNotificationId(key, usedIds),
      reminderId: reminder.id,
      reminderUpdatedAt: reminder.updatedAt,
      projectionVersion: notificationProjectionVersion,
    };
    usedIds.add(state.notificationId);

    if (stored && pendingIds.has(stored.notificationId)) {
      await LocalNotifications.cancel({
        notifications: [{ id: stored.notificationId }],
      });
    }

    const copy = await copyFor(reminder);
    await LocalNotifications.schedule({
      notifications: [notificationFor(reminder, state, copy, schedule)],
    });
    await database.nativeNotificationState.put(state);
  }
};

export const clearNativeNotificationsForReminder = async (
  reminderId: string,
): Promise<void> => {
  const states = await database.nativeNotificationState
    .where('reminderId')
    .equals(reminderId)
    .toArray();
  if (!states.length) return;

  await database.nativeNotificationState.bulkDelete(
    states.map(({ key }) => key),
  );

  if (!hasNativeNotifications()) return;

  const notifications = states.map(({ notificationId }) => ({
    id: notificationId,
  }));
  try {
    await LocalNotifications.cancel({ notifications });
    const delivered = await LocalNotifications.getDeliveredNotifications();
    const notificationIds = new Set(
      states.map(({ notificationId }) => notificationId),
    );
    const matchingDelivered = delivered.notifications.filter(({ id }) =>
      notificationIds.has(id),
    );
    if (matchingDelivered.length) {
      await LocalNotifications.removeDeliveredNotifications({
        notifications: matchingDelivered,
      });
    }
  } catch {
    // The local document state remains correct if the platform cleanup fails.
  }
};
