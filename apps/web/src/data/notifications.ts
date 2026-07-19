import { App as NativeApp } from '@capacitor/app';
import type { PermissionState } from '@capacitor/core';
import { nextReminderAt, type ReminderDocument } from '@mindfull/domain';

import { database, type LocalNotificationState } from './database';
import { findHabitLog } from './document-store';
import { documentsChanged } from './events';
import { setHabitCompleted } from './habits';
import {
  hasNativeExactAlarms,
  hasNativeNotifications,
  type NativeNotificationAction,
  nativeExactAlarmPermission,
  nativeNotificationActions,
  nativeNotificationPermission,
  reconcileNativeNotifications,
  requestNativeExactAlarmPermission,
  requestNativeNotificationPermission,
  startNativeNotificationActions,
} from './native-notifications';
import { setTaskCompleted, snoozeTaskReminder } from './tasks';
import { localDateFor } from './time';

const maximumTimeoutMs = 2_147_000_000;
const initialNotificationAccessKey =
  'mindfull.initial-notification-access-requested';

export type BrowserNotificationPermission =
  | NotificationPermission
  | 'unsupported';

export type DeviceNotificationPermission =
  | BrowserNotificationPermission
  | PermissionState;

export type ExactNotificationPermission = PermissionState | 'unsupported';

export type ReminderNotice = {
  reminder: ReminderDocument;
  state: LocalNotificationState;
  text: string;
};

export const browserNotificationPermission =
  (): BrowserNotificationPermission =>
    'Notification' in window ? Notification.permission : 'unsupported';

export const notificationCopy = async (
  reminder: ReminderDocument,
): Promise<{ title: string; body: string }> => {
  const target = await database.documents.get(reminder.payload.targetId);

  if (reminder.payload.targetType === 'habit' && target?.type === 'habit') {
    return { title: 'A gentle reminder', body: target.payload.name };
  }

  if (reminder.payload.targetType === 'task' && target?.type === 'task') {
    return { title: 'Something to keep in view', body: target.payload.text };
  }

  return {
    title: 'A moment to check in',
    body:
      reminder.payload.targetId === 'evening'
        ? 'Take two quiet minutes to close the day.'
        : 'Take two quiet minutes to meet the day.',
  };
};

export const loadReminderNotices = async (): Promise<ReminderNotice[]> => {
  const today = localDateFor(new Date());
  const states = await database.notificationState
    .filter(({ activeStatus }) => activeStatus !== null)
    .toArray();

  const notices = await Promise.all(
    states.map(async (state): Promise<ReminderNotice | null> => {
      const reminder = await database.documents.get(state.reminderId);
      if (
        reminder?.type !== 'reminder' ||
        reminder.deletedAt ||
        !reminder.payload.enabled
      ) {
        return null;
      }

      const target = await database.documents.get(reminder.payload.targetId);
      if (reminder.payload.targetType === 'task') {
        if (
          target?.type !== 'task' ||
          target.deletedAt ||
          target.payload.completedAt
        ) {
          return null;
        }
        return { reminder, state, text: target.payload.text };
      }

      if (reminder.payload.targetType === 'habit') {
        const habitLog = await findHabitLog(reminder.payload.targetId, today);
        if (
          target?.type !== 'habit' ||
          target.deletedAt ||
          target.payload.archivedAt ||
          habitLog?.payload.outcome === 'completed'
        ) {
          return null;
        }
        return { reminder, state, text: target.payload.name };
      }

      return {
        reminder,
        state,
        text:
          reminder.payload.targetId === 'evening'
            ? 'Evening check-in'
            : 'Morning check-in',
      };
    }),
  );

  return notices.filter((notice): notice is ReminderNotice => notice !== null);
};

const showBrowserNotification = async (
  reminder: ReminderDocument,
): Promise<boolean> => {
  if (browserNotificationPermission() !== 'granted') return false;
  if (!('serviceWorker' in navigator)) return false;

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return false;
    const copy = await notificationCopy(reminder);
    await registration.showNotification(copy.title, {
      body: copy.body,
      tag: reminder.id,
      icon: '/mindfull.svg',
    });
    return true;
  } catch {
    return false;
  }
};

const shouldKeepActiveReminder = async (
  reminder: ReminderDocument,
  now: Date,
): Promise<boolean> => {
  const target = await database.documents.get(reminder.payload.targetId);

  if (reminder.payload.targetType === 'task') {
    return (
      target?.type === 'task' &&
      !target.deletedAt &&
      !target.payload.completedAt
    );
  }

  if (reminder.payload.targetType === 'habit') {
    if (
      target?.type !== 'habit' ||
      target.deletedAt ||
      target.payload.archivedAt
    ) {
      return false;
    }
    const habitLog = await findHabitLog(
      reminder.payload.targetId,
      localDateFor(now),
    );
    return habitLog?.payload.outcome !== 'completed';
  }

  return true;
};

const activeReminders = async (now: Date): Promise<ReminderDocument[]> => {
  const documents = await database.documents
    .where('type')
    .equals('reminder')
    .toArray();

  const reminders = documents.filter(
    (document): document is ReminderDocument =>
      document.type === 'reminder' &&
      !document.deletedAt &&
      document.payload.enabled,
  );

  const active = await Promise.all(
    reminders.map(async (reminder) =>
      (await shouldKeepActiveReminder(reminder, now)) ? reminder : null,
    ),
  );
  return active.filter(
    (reminder): reminder is ReminderDocument => reminder !== null,
  );
};

const configuredTimezone = async (): Promise<string> => {
  const settings = await database.documents.get('settings');
  return settings?.type === 'settings'
    ? settings.payload.timezone
    : Intl.DateTimeFormat().resolvedOptions().timeZone;
};

const initialState = (
  reminder: ReminderDocument,
  now: Date,
  timezone: string,
): LocalNotificationState => ({
  reminderId: reminder.id,
  reminderUpdatedAt: reminder.updatedAt,
  nextScheduledAt: nextReminderAt(reminder.payload, now, timezone),
  activeOccurrenceAt: null,
  activeStatus: null,
});

export const reconcileReminderState = async (
  reminder: ReminderDocument,
  previous: LocalNotificationState | undefined,
  now: Date,
  timezone: string,
): Promise<LocalNotificationState> => {
  if (!previous || previous.reminderUpdatedAt !== reminder.updatedAt) {
    const state = initialState(reminder, now, timezone);
    if (
      reminder.payload.scheduledAt &&
      reminder.payload.scheduledAt <= now.toISOString()
    ) {
      const wasShown = await showBrowserNotification(reminder);
      return {
        ...state,
        activeOccurrenceAt: reminder.payload.scheduledAt,
        activeStatus: wasShown ? 'notified' : 'due',
      };
    }
    return state;
  }

  if (
    !previous.nextScheduledAt ||
    previous.nextScheduledAt > now.toISOString()
  ) {
    if (previous.activeStatus === 'due') {
      const wasShown = await showBrowserNotification(reminder);
      return wasShown ? { ...previous, activeStatus: 'notified' } : previous;
    }
    return previous;
  }

  const occurrenceAt = previous.nextScheduledAt;
  const wasShown = await showBrowserNotification(reminder);
  return {
    ...previous,
    nextScheduledAt: nextReminderAt(reminder.payload, now, timezone),
    activeOccurrenceAt: occurrenceAt,
    activeStatus: wasShown ? 'notified' : 'due',
  };
};

let reminderTimer: number | undefined;
let isReconciling = false;
let shouldReconcileAgain = false;

const armNextTimer = (states: LocalNotificationState[], now: Date): void => {
  if (reminderTimer !== undefined) window.clearTimeout(reminderTimer);
  const nextScheduledAt = states
    .map(({ nextScheduledAt }) => nextScheduledAt)
    .filter((value): value is string => value !== null)
    .sort()[0];

  if (!nextScheduledAt) return;

  const delayMs = Math.min(
    maximumTimeoutMs,
    Math.max(0, Date.parse(nextScheduledAt) - now.getTime()),
  );
  reminderTimer = window.setTimeout(
    () => void reconcileNotifications(),
    delayMs,
  );
};

export const reconcileNotifications = async (): Promise<void> => {
  if (isReconciling) {
    shouldReconcileAgain = true;
    return;
  }

  isReconciling = true;
  try {
    do {
      shouldReconcileAgain = false;
      const now = new Date();
      const [reminders, timezone] = await Promise.all([
        activeReminders(now),
        configuredTimezone(),
      ]);
      const reminderIds = new Set(reminders.map(({ id }) => id));
      const staleStates = await database.notificationState
        .filter(({ reminderId }) => !reminderIds.has(reminderId))
        .primaryKeys();
      await database.notificationState.bulkDelete(staleStates);

      const states = await Promise.all(
        reminders.map(async (reminder) => {
          const previous = await database.notificationState.get(reminder.id);
          const state = await reconcileReminderState(
            reminder,
            previous,
            now,
            timezone,
          );
          await database.notificationState.put(state);
          return state;
        }),
      );
      armNextTimer(states, now);
      try {
        await reconcileNativeNotifications(reminders, notificationCopy);
      } catch {
        // In-app reminders remain available if native scheduling is interrupted.
      }
    } while (shouldReconcileAgain);
  } finally {
    isReconciling = false;
  }
};

export const deviceNotificationPermission =
  async (): Promise<DeviceNotificationPermission> => {
    if (hasNativeNotifications()) {
      return (await nativeNotificationPermission()).display;
    }
    return browserNotificationPermission();
  };

export const requestDeviceNotificationPermission = async () => {
  const permission = hasNativeNotifications()
    ? (await requestNativeNotificationPermission()).display
    : 'Notification' in window
      ? await Notification.requestPermission()
      : ('unsupported' as const);
  await reconcileNotifications();
  return permission;
};

export const exactNotificationPermission =
  async (): Promise<ExactNotificationPermission> => {
    if (!hasNativeExactAlarms()) return 'unsupported' as const;
    return (await nativeExactAlarmPermission()).exact_alarm;
  };

export const requestExactNotificationPermission =
  async (): Promise<ExactNotificationPermission> => {
    if (!hasNativeExactAlarms()) return 'unsupported' as const;
    const permission = (await requestNativeExactAlarmPermission()).exact_alarm;
    await reconcileNotifications();
    return permission;
  };

export const requestInitialNotificationAccess = async (): Promise<void> => {
  if (
    !hasNativeNotifications() ||
    window.localStorage.getItem(initialNotificationAccessKey)
  ) {
    return;
  }

  let display = (await nativeNotificationPermission()).display;
  if (display !== 'granted') {
    display = (await requestNativeNotificationPermission()).display;
  }

  window.localStorage.setItem(initialNotificationAccessKey, 'requested');
  if (display !== 'granted' || !hasNativeExactAlarms()) return;

  const exact = (await nativeExactAlarmPermission()).exact_alarm;
  if (exact !== 'granted') await requestNativeExactAlarmPermission();
  await reconcileNotifications();
};

export const dismissActiveReminder = async (
  reminderId: string,
): Promise<void> => {
  const state = await database.notificationState.get(reminderId);
  if (!state) return;
  await database.notificationState.put({
    ...state,
    activeOccurrenceAt: null,
    activeStatus: null,
  });
};

const reminderIdFromAction = (
  action: NativeNotificationAction,
): string | null => {
  const reminderId = action.notification.extra?.reminderId;
  return typeof reminderId === 'string' && reminderId ? reminderId : null;
};

export const applyNativeNotificationAction = async (
  action: NativeNotificationAction,
  now = new Date(),
): Promise<'/' | null> => {
  const reminderId = reminderIdFromAction(action);
  if (!reminderId) return null;

  const reminder = await database.documents.get(reminderId);
  if (reminder?.type !== 'reminder' || reminder.deletedAt) return null;

  if (action.actionId === nativeNotificationActions.tap) {
    await dismissActiveReminder(reminder.id);
    return '/';
  }

  const target = await database.documents.get(reminder.payload.targetId);
  if (
    action.actionId === nativeNotificationActions.completeTask ||
    action.actionId === nativeNotificationActions.snoozeTask
  ) {
    if (reminder.payload.targetType !== 'task') return null;
    if (
      target?.type === 'task' &&
      !target.deletedAt &&
      !target.payload.completedAt
    ) {
      if (action.actionId === nativeNotificationActions.completeTask) {
        await setTaskCompleted(target.id, true);
      } else {
        const reminderAt = new Date(now.getTime() + 60 * 60 * 1000);
        await snoozeTaskReminder(target.id, reminderAt.toISOString());
      }
    }
    await dismissActiveReminder(reminder.id);
    return '/';
  }

  if (action.actionId === nativeNotificationActions.completeHabit) {
    if (reminder.payload.targetType !== 'habit') return null;
    if (
      target?.type === 'habit' &&
      !target.deletedAt &&
      !target.payload.archivedAt
    ) {
      await setHabitCompleted(target.id, localDateFor(now), true);
    }
    await dismissActiveReminder(reminder.id);
    return '/';
  }

  return null;
};

export const startNotificationCoordinator = ({
  openPath,
}: {
  openPath?: (path: '/') => void;
} = {}): (() => void) => {
  const reconcile = () => void reconcileNotifications();
  const reconcileWhenVisible = () => {
    if (document.visibilityState === 'visible') reconcile();
  };

  window.addEventListener(documentsChanged, reconcile);
  window.addEventListener('focus', reconcile);
  document.addEventListener('visibilitychange', reconcileWhenVisible);
  let removeNativeListener: (() => Promise<void>) | undefined;
  let removeNativeActionListener: (() => Promise<void>) | undefined;
  let isStopped = false;
  if (hasNativeNotifications()) {
    void NativeApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) reconcile();
    }).then((listener) => {
      if (isStopped) void listener.remove();
      else removeNativeListener = listener.remove;
    });
    void startNativeNotificationActions((action) => {
      void applyNativeNotificationAction(action)
        .then(async (path) => {
          if (path) openPath?.(path);
          await reconcileNotifications();
        })
        .catch(() => {
          // The app remains usable if a stale native action cannot be applied.
        });
    })
      .then((listener) => {
        if (isStopped) void listener.remove();
        else removeNativeActionListener = listener.remove;
      })
      .catch(() => {
        // In-app reminders remain available if action registration fails.
      });
  }
  reconcile();

  return () => {
    isStopped = true;
    if (reminderTimer !== undefined) window.clearTimeout(reminderTimer);
    window.removeEventListener(documentsChanged, reconcile);
    window.removeEventListener('focus', reconcile);
    document.removeEventListener('visibilitychange', reconcileWhenVisible);
    void removeNativeListener?.();
    void removeNativeActionListener?.();
  };
};
