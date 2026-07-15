import { Capacitor } from '@capacitor/core';
import {
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
  state: NativeNotificationState,
  copy: NotificationCopy,
  schedule: Schedule,
): LocalNotificationSchema => ({
  id: state.notificationId,
  title: copy.title,
  body: copy.body,
  schedule,
  channelId,
  autoCancel: true,
  extra: { reminderId: state.reminderId },
});

export const reconcileNativeNotifications = async (
  reminders: ReminderDocument[],
  copyFor: (reminder: ReminderDocument) => Promise<NotificationCopy>,
): Promise<void> => {
  if (!hasNativeNotifications()) return;

  const permission = await nativeNotificationPermission();
  if (permission.display !== 'granted') return;

  await ensureChannel();
  const [storedStates, pending] = await Promise.all([
    database.nativeNotificationState.toArray(),
    LocalNotifications.getPending(),
  ]);
  const pendingIds = new Set(pending.notifications.map(({ id }) => id));
  const usedIds = new Set(
    storedStates.map(({ notificationId }) => notificationId),
  );
  const desired = reminders.flatMap((reminder) =>
    nativeReminderSchedules(reminder).map((nativeSchedule) => ({
      reminder,
      ...nativeSchedule,
    })),
  );
  const desiredKeys = new Set(desired.map(({ key }) => key));
  const staleStates = storedStates.filter(({ key }) => !desiredKeys.has(key));

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
    };
    usedIds.add(state.notificationId);

    if (stored && pendingIds.has(stored.notificationId)) {
      await LocalNotifications.cancel({
        notifications: [{ id: stored.notificationId }],
      });
    }

    const copy = await copyFor(reminder);
    await LocalNotifications.schedule({
      notifications: [notificationFor(state, copy, schedule)],
    });
    await database.nativeNotificationState.put(state);
  }
};
