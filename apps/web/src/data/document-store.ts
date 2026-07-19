import {
  type BodyMeasurementDocument,
  type BodyMetricDocument,
  type BodyMetricKind,
  type BodyUnit,
  type CheckInDocument,
  type CheckInKind,
  type CheckInPayload,
  compareDocumentVersions,
  completedTasksPastRetention,
  createBodyMeasurementDocument,
  createBodyMetricDocument,
  createCheckInDocument,
  createDocumentId,
  createHabitDocument,
  createHabitLogDocument,
  createJournalDocument,
  createReminderDocument,
  createSettingsDocument,
  createTaskDocument,
  createTaskSuggestionDocument,
  type DomainDocument,
  defaultBodyMetrics,
  type HabitDocument,
  type HabitLogDocument,
  type HabitLogPayload,
  type HabitPayload,
  type HabitSuggestionDocument,
  habitIdForSuggestion,
  habitLogIdFor,
  isCheckInScheduleValid,
  type JournalDocument,
  type JournalPayload,
  nextDocumentTimestamp,
  parseDomainDocument,
  type ReminderDocument,
  type ReminderPayload,
  reminderIdFor,
  type SettingsDocument,
  selectCuratedPrompts,
  type TaskDocument,
  type TaskSuggestionDocument,
  type TaskSuggestionPayload,
  taskIdForSuggestion,
  toCanonicalBodyValue,
  withHabitSchedule,
} from '@mindfull/domain';
import { database } from './database';
import { getDeviceId } from './device';
import { claimLocalDocument } from './document-ownership';
import { documentsChanged, localDocumentsChanged } from './events';
import { clearNativeNotificationsForReminder } from './native-notifications';
import { currentTimezone, localDateFor } from './time';

const settingsId = 'settings';

const updatedNow = (document: DomainDocument): string =>
  nextDocumentTimestamp(document.updatedAt, new Date().toISOString());

const markDirty = async (documentId: string): Promise<void> => {
  await database.syncState.put({
    documentId,
    dirty: 1,
    lastSyncedAt: null,
    lastServerVersion: null,
  });
};

const allWeekdays = [0, 1, 2, 3, 4, 5, 6];
const defaultBodyMetricCreatedAt = '2026-01-01T00:00:00.000Z';

const reminderFor = async (
  targetType: ReminderPayload['targetType'],
  targetId: string,
): Promise<ReminderDocument | undefined> => {
  const document = await database.documents.get(
    reminderIdFor(targetType, targetId),
  );
  return document?.type === 'reminder' ? document : undefined;
};

const reminderDocument = async (
  payload: ReminderPayload,
): Promise<ReminderDocument> => {
  const id = reminderIdFor(payload.targetType, payload.targetId);
  const existing = await database.documents.get(id);
  const now = new Date().toISOString();

  if (existing?.type === 'reminder') {
    return {
      ...existing,
      payload,
      deletedAt: null,
      updatedAt: updatedNow(existing),
      updatedByDeviceId: getDeviceId(),
    };
  }

  return createReminderDocument({
    id,
    now,
    deviceId: getDeviceId(),
    payload,
  });
};

const clearReminderPresentation = async (reminderId: string): Promise<void> => {
  const state = await database.notificationState.get(reminderId);
  if (state) {
    await database.notificationState.put({
      ...state,
      activeOccurrenceAt: null,
      activeStatus: null,
    });
  }
  await clearNativeNotificationsForReminder(reminderId);
};

export const saveDocuments = async (
  documents: DomainDocument[],
): Promise<void> => {
  const deviceId = getDeviceId();
  const now = new Date().toISOString();
  const validatedDocuments = documents
    .map(parseDomainDocument)
    .map((document) => claimLocalDocument(document, deviceId, now));

  await database.transaction(
    'rw',
    database.documents,
    database.syncState,
    async () => {
      await database.documents.bulkPut(validatedDocuments);
      await Promise.all(validatedDocuments.map(({ id }) => markDirty(id)));
    },
  );

  window.dispatchEvent(new Event(localDocumentsChanged));
  window.dispatchEvent(new Event(documentsChanged));
};

export const saveDocument = async (document: DomainDocument): Promise<void> =>
  saveDocuments([document]);

export const applyRemoteDocuments = async (
  documents: DomainDocument[],
  serverVersion: number,
): Promise<void> => {
  const remoteDocuments = documents.map(parseDomainDocument);
  const syncedAt = new Date().toISOString();

  await database.transaction(
    'rw',
    database.documents,
    database.syncState,
    async () => {
      for (const remoteDocument of remoteDocuments) {
        const localDocument = await database.documents.get(remoteDocument.id);

        if (
          localDocument &&
          compareDocumentVersions(localDocument, remoteDocument) > 0
        ) {
          continue;
        }

        await database.documents.put(remoteDocument);
        await database.syncState.put({
          documentId: remoteDocument.id,
          dirty: 0,
          lastSyncedAt: syncedAt,
          lastServerVersion: serverVersion,
        });
      }
    },
  );

  window.dispatchEvent(new Event(documentsChanged));
};

export const ensureSettings = async (): Promise<SettingsDocument> => {
  const existingSettings = await database.documents.get(settingsId);

  if (existingSettings?.type === 'settings' && !existingSettings.deletedAt) {
    const migratedSettings = parseDomainDocument(existingSettings);

    if (migratedSettings.type !== 'settings') {
      throw new Error('Could not read settings.');
    }

    if (!Object.hasOwn(existingSettings.payload, 'ambience')) {
      await saveDocument(migratedSettings);
    }

    return migratedSettings;
  }

  const now = new Date().toISOString();
  const settings = createSettingsDocument({
    id: settingsId,
    now,
    deviceId: getDeviceId(),
    payload: {
      timezone: currentTimezone(),
      theme: 'system',
      ambience: 'gentle',
      morningStartsAt: '05:00',
      eveningStartsAt: '18:00',
      weeklyReviewDay: 0,
      weeklyReviewTime: '19:00',
      completedTaskRetentionDays: 7,
    },
  });

  await saveDocument(settings);
  return settings;
};

export const updateTheme = async (
  theme: SettingsDocument['payload']['theme'],
): Promise<void> => {
  const settings = await ensureSettings();
  const now = updatedNow(settings);

  await saveDocument({
    ...settings,
    payload: { ...settings.payload, theme },
    updatedAt: now,
    updatedByDeviceId: getDeviceId(),
  });
};

export const updateAmbience = async (
  ambience: SettingsDocument['payload']['ambience'],
): Promise<void> => {
  const settings = await ensureSettings();
  const now = updatedNow(settings);

  await saveDocument({
    ...settings,
    payload: { ...settings.payload, ambience },
    updatedAt: now,
    updatedByDeviceId: getDeviceId(),
  });
};

export const updateCheckInSchedule = async (
  morningStartsAt: string,
  eveningStartsAt: string,
): Promise<void> => {
  if (!isCheckInScheduleValid(morningStartsAt, eveningStartsAt)) {
    throw new Error('Morning must begin before evening.');
  }

  const settings = await ensureSettings();
  const now = updatedNow(settings);

  await saveDocument({
    ...settings,
    payload: { ...settings.payload, morningStartsAt, eveningStartsAt },
    updatedAt: now,
    updatedByDeviceId: getDeviceId(),
  });
};

const bodyMetricsFrom = (documents: DomainDocument[]): BodyMetricDocument[] =>
  documents
    .filter(
      (document): document is BodyMetricDocument =>
        document.type === 'body-metric' && !document.deletedAt,
    )
    .sort(
      (left, right) =>
        (left.sortKey ?? '').localeCompare(right.sortKey ?? '') ||
        left.payload.name.localeCompare(right.payload.name),
    );

export const ensureDefaultBodyMetrics = async (): Promise<
  BodyMetricDocument[]
> => {
  const existingDocuments = await database.documents
    .where('type')
    .equals('body-metric')
    .toArray();
  const existingIds = new Set(existingDocuments.map(({ id }) => id));
  const missingMetrics = defaultBodyMetrics.flatMap((metric, index) =>
    existingIds.has(metric.id)
      ? []
      : [
          createBodyMetricDocument({
            id: metric.id,
            now: defaultBodyMetricCreatedAt,
            deviceId: getDeviceId(),
            sortKey: `default:${index.toString().padStart(2, '0')}`,
            payload: {
              name: metric.name,
              kind: metric.kind,
              preferredUnit: metric.preferredUnit,
              archivedAt: null,
            },
          }),
        ],
  );

  if (missingMetrics.length) await saveDocuments(missingMetrics);
  return bodyMetricsFrom([...existingDocuments, ...missingMetrics]);
};

export const createBodyMetric = async (
  name: string,
  kind: BodyMetricKind,
  preferredUnit: BodyUnit,
): Promise<BodyMetricDocument> => {
  const now = new Date().toISOString();
  const metric = createBodyMetricDocument({
    id: createDocumentId(),
    now,
    deviceId: getDeviceId(),
    sortKey: `custom:${now}:${createDocumentId()}`,
    payload: { name, kind, preferredUnit, archivedAt: null },
  });

  await saveDocument(metric);
  return metric;
};

const getBodyMetric = async (metricId: string): Promise<BodyMetricDocument> => {
  const document = await database.documents.get(metricId);
  if (document?.type !== 'body-metric' || document.deletedAt) {
    throw new Error(`Body metric ${metricId} was not found.`);
  }
  return document;
};

export const updateBodyMetric = async (
  metricId: string,
  update: Pick<BodyMetricDocument['payload'], 'name' | 'preferredUnit'>,
): Promise<BodyMetricDocument> => {
  const metric = await getBodyMetric(metricId);
  const updatedMetric = parseDomainDocument({
    ...metric,
    payload: { ...metric.payload, ...update },
    updatedAt: updatedNow(metric),
    updatedByDeviceId: getDeviceId(),
  });

  if (updatedMetric.type !== 'body-metric') {
    throw new Error('Expected an updated body metric document.');
  }
  await saveDocument(updatedMetric);
  return updatedMetric;
};

export const setBodyMetricArchived = async (
  metricId: string,
  isArchived: boolean,
): Promise<void> => {
  const metric = await getBodyMetric(metricId);
  const now = updatedNow(metric);
  await saveDocument({
    ...metric,
    payload: { ...metric.payload, archivedAt: isArchived ? now : null },
    updatedAt: now,
    updatedByDeviceId: getDeviceId(),
  });
};

export const addBodyMeasurement = async (
  metricId: string,
  valueInPreferredUnit: number,
  recordedAt = new Date(),
): Promise<BodyMeasurementDocument> => {
  const metric = await getBodyMetric(metricId);
  const now = recordedAt.toISOString();
  const measurement = createBodyMeasurementDocument({
    id: createDocumentId(),
    now,
    deviceId: getDeviceId(),
    occurredAt: now,
    payload: {
      metricId,
      value: toCanonicalBodyValue(
        valueInPreferredUnit,
        metric.payload.preferredUnit,
      ),
    },
  });

  await saveDocument(measurement);
  return measurement;
};

const getBodyMeasurement = async (
  measurementId: string,
): Promise<BodyMeasurementDocument> => {
  const document = await database.documents.get(measurementId);
  if (document?.type !== 'body-measurement' || document.deletedAt) {
    throw new Error(`Body measurement ${measurementId} was not found.`);
  }
  return document;
};

export const updateBodyMeasurement = async (
  measurementId: string,
  valueInPreferredUnit: number,
): Promise<BodyMeasurementDocument> => {
  const measurement = await getBodyMeasurement(measurementId);
  const metric = await getBodyMetric(measurement.payload.metricId);
  const updatedMeasurement = parseDomainDocument({
    ...measurement,
    payload: {
      ...measurement.payload,
      value: toCanonicalBodyValue(
        valueInPreferredUnit,
        metric.payload.preferredUnit,
      ),
    },
    updatedAt: updatedNow(measurement),
    updatedByDeviceId: getDeviceId(),
  });

  if (updatedMeasurement.type !== 'body-measurement') {
    throw new Error('Expected an updated body measurement document.');
  }
  await saveDocument(updatedMeasurement);
  return updatedMeasurement;
};

export const deleteBodyMeasurement = async (
  measurementId: string,
): Promise<void> => {
  const measurement = await getBodyMeasurement(measurementId);
  const now = updatedNow(measurement);
  await saveDocument({
    ...measurement,
    deletedAt: now,
    updatedAt: now,
    updatedByDeviceId: getDeviceId(),
  });
};

export const createHabit = async (
  input: Pick<HabitPayload, 'name' | 'weekdays' | 'reminderTime'>,
): Promise<HabitDocument> => {
  const now = new Date().toISOString();
  const localDate = localDateFor(new Date(now));
  const id = createDocumentId();
  const habit = createHabitDocument({
    id,
    now,
    deviceId: getDeviceId(),
    sortKey: `habit:${now}:${id}`,
    payload: {
      ...input,
      schedules: [{ effectiveFrom: localDate, weekdays: input.weekdays }],
      archivedAt: null,
    },
  });

  const documents: DomainDocument[] = [habit];
  if (input.reminderTime) {
    documents.push(
      await reminderDocument({
        targetType: 'habit',
        targetId: habit.id,
        scheduledAt: null,
        localTime: input.reminderTime,
        weekdays: input.weekdays,
        enabled: true,
      }),
    );
  }

  await saveDocuments(documents);
  return habit;
};

const getHabitSuggestion = async (
  suggestionId: string,
): Promise<HabitSuggestionDocument> => {
  const document = await database.documents.get(suggestionId);
  if (document?.type !== 'habit-suggestion' || document.deletedAt) {
    throw new Error(`Habit suggestion ${suggestionId} was not found.`);
  }
  return document;
};

export const loadHabitSuggestion = async (
  suggestionId: string,
): Promise<HabitSuggestionDocument | undefined> => {
  const document = await database.documents.get(suggestionId);
  return document?.type === 'habit-suggestion' &&
    !document.deletedAt &&
    document.payload.state === 'pending'
    ? document
    : undefined;
};

export const acceptHabitSuggestion = async (
  suggestionId: string,
  input: Pick<HabitPayload, 'name' | 'weekdays' | 'reminderTime'>,
): Promise<HabitDocument> => {
  const suggestion = await getHabitSuggestion(suggestionId);

  if (suggestion.payload.state === 'accepted') {
    const acceptedHabit = suggestion.payload.acceptedHabitId
      ? await database.documents.get(suggestion.payload.acceptedHabitId)
      : undefined;
    if (acceptedHabit?.type === 'habit') return acceptedHabit;
  }

  if (suggestion.payload.state !== 'pending') {
    throw new Error('This suggestion has already been resolved.');
  }

  const now = new Date().toISOString();
  const localDate = localDateFor(new Date(now));
  const id = habitIdForSuggestion(suggestion.id);
  const habit = createHabitDocument({
    id,
    now,
    deviceId: getDeviceId(),
    sortKey: `habit:${now}:${id}`,
    payload: {
      ...input,
      schedules: [{ effectiveFrom: localDate, weekdays: input.weekdays }],
      archivedAt: null,
    },
  });

  const documents: DomainDocument[] = [habit];
  if (input.reminderTime) {
    documents.push(
      await reminderDocument({
        targetType: 'habit',
        targetId: habit.id,
        scheduledAt: null,
        localTime: input.reminderTime,
        weekdays: input.weekdays,
        enabled: true,
      }),
    );
  }

  documents.push({
    ...suggestion,
    payload: {
      ...suggestion.payload,
      state: 'accepted',
      acceptedHabitId: habit.id,
    },
    updatedAt: nextDocumentTimestamp(suggestion.updatedAt, now),
    updatedByDeviceId: getDeviceId(),
  });

  await saveDocuments(documents);
  return habit;
};

export const rejectHabitSuggestion = async (
  suggestionId: string,
): Promise<void> => {
  const suggestion = await getHabitSuggestion(suggestionId);
  if (suggestion.payload.state !== 'pending') return;

  await saveDocument({
    ...suggestion,
    payload: { ...suggestion.payload, state: 'rejected' },
    updatedAt: updatedNow(suggestion),
    updatedByDeviceId: getDeviceId(),
  });
};

const getHabit = async (habitId: string): Promise<HabitDocument> => {
  const document = await database.documents.get(habitId);

  if (document?.type !== 'habit') {
    throw new Error(`Habit ${habitId} was not found.`);
  }

  return document;
};

export const updateHabit = async (
  habitId: string,
  update: Pick<HabitPayload, 'name' | 'weekdays' | 'reminderTime'>,
): Promise<HabitDocument> => {
  const habit = await getHabit(habitId);
  const effectiveFrom = localDateFor(new Date());
  const startedOn = localDateFor(new Date(habit.createdAt));
  const schedules = withHabitSchedule(
    habit.payload,
    update.weekdays,
    effectiveFrom,
    startedOn,
  );
  const updatedDocument = parseDomainDocument({
    ...habit,
    payload: { ...habit.payload, ...update, schedules },
    updatedAt: updatedNow(habit),
    updatedByDeviceId: getDeviceId(),
  });

  if (updatedDocument.type !== 'habit') {
    throw new Error('Expected an updated habit document.');
  }

  const existingReminder = await reminderFor('habit', habitId);
  const reminder =
    update.reminderTime || existingReminder
      ? await reminderDocument({
          targetType: 'habit',
          targetId: habitId,
          scheduledAt: null,
          localTime:
            update.reminderTime ??
            existingReminder?.payload.localTime ??
            '09:00',
          weekdays: update.weekdays,
          enabled: Boolean(update.reminderTime),
        })
      : undefined;

  await saveDocuments(
    reminder ? [updatedDocument, reminder] : [updatedDocument],
  );
  return updatedDocument;
};

export const reorderHabits = async (
  orderedHabitIds: string[],
): Promise<void> => {
  if (new Set(orderedHabitIds).size !== orderedHabitIds.length) {
    throw new Error('A habit cannot appear more than once in the order.');
  }

  const documents = await database.documents.bulkGet(orderedHabitIds);
  const reorderedHabits = documents.map((document, index) => {
    if (document?.type !== 'habit' || document.deletedAt) {
      throw new Error(`Habit ${orderedHabitIds[index]} was not found.`);
    }

    const sortKey = `habit:${index.toString().padStart(6, '0')}`;
    if (document.sortKey === sortKey) return document;

    return {
      ...document,
      sortKey,
      updatedAt: updatedNow(document),
      updatedByDeviceId: getDeviceId(),
    };
  });
  const changedHabits = reorderedHabits.filter(
    (habit, index) => habit !== documents[index],
  );

  if (changedHabits.length) await saveDocuments(changedHabits);
};

export const setHabitArchived = async (
  habitId: string,
  isArchived: boolean,
): Promise<void> => {
  const habit = await getHabit(habitId);
  const now = updatedNow(habit);

  const updatedHabit: HabitDocument = {
    ...habit,
    payload: { ...habit.payload, archivedAt: isArchived ? now : null },
    sortKey: isArchived ? habit.sortKey : `habit:${now}:${habit.id}`,
    updatedAt: now,
    updatedByDeviceId: getDeviceId(),
  };
  const existingReminder = await reminderFor('habit', habitId);

  if (!existingReminder) {
    await saveDocument(updatedHabit);
    return;
  }

  const reminder = await reminderDocument({
    ...existingReminder.payload,
    weekdays: habit.payload.weekdays,
    enabled: !isArchived && Boolean(habit.payload.reminderTime),
  });
  await saveDocuments([updatedHabit, reminder]);
};

export const findHabitLog = async (
  habitId: string,
  localDate: string,
): Promise<HabitLogDocument | undefined> => {
  const document = await database.documents.get(
    habitLogIdFor(habitId, localDate),
  );

  return document?.type === 'habit-log' && !document.deletedAt
    ? document
    : undefined;
};

const setHabitLog = async (
  payload: HabitLogPayload,
): Promise<HabitLogDocument> => {
  const id = habitLogIdFor(payload.habitId, payload.localDate);
  const existing = await database.documents.get(id);
  const now = new Date().toISOString();
  const document =
    existing?.type === 'habit-log'
      ? parseDomainDocument({
          ...existing,
          payload,
          deletedAt: null,
          updatedAt: updatedNow(existing),
          updatedByDeviceId: getDeviceId(),
        })
      : createHabitLogDocument({
          id,
          now,
          deviceId: getDeviceId(),
          payload,
        });

  if (document.type !== 'habit-log') {
    throw new Error('Expected a habit-log document.');
  }

  await saveDocument(document);
  return document;
};

export const setHabitCompleted = async (
  habitId: string,
  localDate: string,
  isCompleted: boolean,
): Promise<void> => {
  const id = habitLogIdFor(habitId, localDate);
  const existing = await database.documents.get(id);

  if (!isCompleted) {
    if (existing?.type !== 'habit-log' || existing.deletedAt) return;
    const now = updatedNow(existing);
    await saveDocument({
      ...existing,
      deletedAt: now,
      updatedAt: now,
      updatedByDeviceId: getDeviceId(),
    });
    return;
  }

  await setHabitLog({
    habitId,
    localDate,
    timezone: currentTimezone(),
    outcome: 'completed',
    reason: null,
  });

  if (localDate === localDateFor(new Date())) {
    await clearReminderPresentation(reminderIdFor('habit', habitId));
  }
};

export const recordHabitMiss = async (
  habitId: string,
  localDate: string,
  reason: string | null,
): Promise<void> => {
  await setHabitLog({
    habitId,
    localDate,
    timezone: currentTimezone(),
    outcome: 'missed',
    reason,
  });
};

export const restoreHabitOccurrence = async (
  habitId: string,
  localDate: string,
  previousLog: HabitLogPayload | null,
): Promise<void> => {
  if (previousLog?.outcome === 'missed') {
    await recordHabitMiss(habitId, localDate, previousLog.reason);
    return;
  }

  await setHabitCompleted(
    habitId,
    localDate,
    previousLog?.outcome === 'completed',
  );
};

const nextTaskSortKey = (): string => {
  const now = Date.now().toString().padStart(16, '0');
  return `${now}:${createDocumentId()}`;
};

export const addTask = async (
  text: string,
  reminderAt: string | null = null,
): Promise<TaskDocument> => {
  const now = new Date().toISOString();
  const task = createTaskDocument({
    id: createDocumentId(),
    now,
    deviceId: getDeviceId(),
    sortKey: nextTaskSortKey(),
    payload: {
      text,
      completedAt: null,
      availableFrom: null,
      reminderAt,
      source: { kind: 'manual' },
    },
  });

  const documents: DomainDocument[] = [task];
  if (reminderAt) {
    documents.push(
      await reminderDocument({
        targetType: 'task',
        targetId: task.id,
        scheduledAt: reminderAt,
        localTime: null,
        weekdays: null,
        enabled: true,
      }),
    );
  }
  await saveDocuments(documents);
  return task;
};

export const addTaskSuggestion = async (
  input: Pick<
    TaskSuggestionPayload,
    'proposedText' | 'availableFrom' | 'sourceDocumentId' | 'sourceContentHash'
  >,
): Promise<TaskSuggestionDocument> => {
  const now = new Date().toISOString();
  const suggestion = createTaskSuggestionDocument({
    id: createDocumentId(),
    now,
    deviceId: getDeviceId(),
    payload: {
      ...input,
      state: 'pending',
      acceptedTaskId: null,
    },
  });

  await saveDocument(suggestion);
  return suggestion;
};

const getTaskSuggestion = async (
  suggestionId: string,
): Promise<TaskSuggestionDocument> => {
  const document = await database.documents.get(suggestionId);

  if (document?.type !== 'task-suggestion') {
    throw new Error(`Task suggestion ${suggestionId} was not found.`);
  }

  return document;
};

export const acceptTaskSuggestion = async (
  suggestionId: string,
): Promise<TaskDocument> => {
  const suggestion = await getTaskSuggestion(suggestionId);

  if (suggestion.payload.state === 'accepted') {
    const acceptedTask = suggestion.payload.acceptedTaskId
      ? await database.documents.get(suggestion.payload.acceptedTaskId)
      : undefined;
    if (acceptedTask?.type === 'task') return acceptedTask;
  }

  if (suggestion.payload.state !== 'pending') {
    throw new Error('This suggestion has already been resolved.');
  }

  const source = await database.documents.get(
    suggestion.payload.sourceDocumentId,
  );
  if (source?.type !== 'journal' && source?.type !== 'check-in') {
    throw new Error('The source reflection could not be found.');
  }

  const now = new Date().toISOString();
  const task = createTaskDocument({
    id: taskIdForSuggestion(suggestion.id),
    now,
    deviceId: getDeviceId(),
    sortKey: nextTaskSortKey(),
    payload: {
      text: suggestion.payload.proposedText,
      completedAt: null,
      availableFrom: suggestion.payload.availableFrom,
      reminderAt: null,
      source: { kind: source.type, documentId: source.id },
    },
  });
  const resolvedSuggestion: TaskSuggestionDocument = {
    ...suggestion,
    payload: {
      ...suggestion.payload,
      state: 'accepted',
      acceptedTaskId: task.id,
    },
    updatedAt: nextDocumentTimestamp(suggestion.updatedAt, now),
    updatedByDeviceId: getDeviceId(),
  };

  await saveDocuments([task, resolvedSuggestion]);
  return task;
};

export const rejectTaskSuggestion = async (
  suggestionId: string,
): Promise<void> => {
  const suggestion = await getTaskSuggestion(suggestionId);
  if (suggestion.payload.state !== 'pending') return;

  await saveDocument({
    ...suggestion,
    payload: { ...suggestion.payload, state: 'rejected' },
    updatedAt: updatedNow(suggestion),
    updatedByDeviceId: getDeviceId(),
  });
};

export const removeExpiredCompletedTasks = async (
  now = new Date(),
): Promise<number> => {
  const settings = await ensureSettings();
  const documents = await database.documents
    .where('type')
    .equals('task')
    .toArray();
  const tasks = documents.filter(
    (document): document is TaskDocument => document.type === 'task',
  );
  const expiredTasks = completedTasksPastRetention(
    tasks,
    now.toISOString(),
    settings.payload.completedTaskRetentionDays,
  );

  if (expiredTasks.length === 0) return 0;

  const tombstones = await Promise.all(
    expiredTasks.map(async (task): Promise<DomainDocument[]> => {
      const deletedAt = nextDocumentTimestamp(
        task.updatedAt,
        now.toISOString(),
      );
      const deletedTask: TaskDocument = {
        ...task,
        deletedAt,
        updatedAt: deletedAt,
        updatedByDeviceId: getDeviceId(),
      };
      const reminder = await reminderFor('task', task.id);

      return reminder
        ? [
            deletedTask,
            {
              ...reminder,
              deletedAt,
              updatedAt: deletedAt,
              updatedByDeviceId: getDeviceId(),
            },
          ]
        : [deletedTask];
    }),
  );

  await saveDocuments(tombstones.flat());
  return expiredTasks.length;
};

export const createJournal = async (
  date = new Date(),
): Promise<JournalDocument> => {
  const now = date.toISOString();
  const journal = createJournalDocument({
    id: createDocumentId(),
    now,
    deviceId: getDeviceId(),
    payload: {
      title: null,
      markdown: '',
      localDate: localDateFor(date),
      timezone: currentTimezone(),
      status: 'draft',
      completedAt: null,
    },
  });

  await saveDocument(journal);
  return journal;
};

const getJournal = async (journalId: string): Promise<JournalDocument> => {
  const document = await database.documents.get(journalId);

  if (document?.type !== 'journal') {
    throw new Error(`Journal ${journalId} was not found.`);
  }

  return document;
};

export const updateJournal = async (
  journalId: string,
  update: Pick<JournalPayload, 'title' | 'markdown'>,
): Promise<JournalDocument> => {
  const journal = await getJournal(journalId);

  if (journal.payload.status !== 'draft') {
    throw new Error('A completed journal cannot be changed.');
  }

  const updatedDocument = parseDomainDocument({
    ...journal,
    payload: { ...journal.payload, ...update },
    updatedAt: updatedNow(journal),
    updatedByDeviceId: getDeviceId(),
  });

  if (updatedDocument.type !== 'journal') {
    throw new Error('Expected an updated journal document.');
  }

  await saveDocument(updatedDocument);
  return updatedDocument;
};

export const completeJournal = async (
  journalId: string,
  date = new Date(),
): Promise<JournalDocument> => {
  const journal = await getJournal(journalId);

  if (journal.payload.status !== 'draft') {
    return journal;
  }

  const updatedDocument = parseDomainDocument({
    ...journal,
    payload: {
      ...journal.payload,
      status: 'completed',
      completedAt: date.toISOString(),
    },
    updatedAt: updatedNow(journal),
    updatedByDeviceId: getDeviceId(),
  });

  if (updatedDocument.type !== 'journal') {
    throw new Error('Expected a completed journal document.');
  }

  await saveDocument(updatedDocument);
  return updatedDocument;
};

export const deleteJournal = async (journalId: string): Promise<void> => {
  const journal = await getJournal(journalId);
  const now = updatedNow(journal);

  await saveDocument({
    ...journal,
    deletedAt: now,
    updatedAt: now,
    updatedByDeviceId: getDeviceId(),
  });
};

const getTask = async (taskId: string): Promise<TaskDocument> => {
  const document = await database.documents.get(taskId);

  if (document?.type !== 'task') {
    throw new Error(`Task ${taskId} was not found.`);
  }

  return document;
};

export const setTaskCompleted = async (
  taskId: string,
  completed: boolean,
): Promise<void> => {
  const task = await getTask(taskId);
  const now = updatedNow(task);
  const updatedTask: TaskDocument = {
    ...task,
    payload: { ...task.payload, completedAt: completed ? now : null },
    updatedAt: now,
    updatedByDeviceId: getDeviceId(),
  };
  const existingReminder = await reminderFor('task', taskId);

  if (!existingReminder) {
    await saveDocument(updatedTask);
    return;
  }

  const reminder = await reminderDocument({
    ...existingReminder.payload,
    enabled:
      !completed &&
      Boolean(task.payload.reminderAt && task.payload.reminderAt > now),
  });
  await saveDocuments([updatedTask, reminder]);
  if (completed) await clearReminderPresentation(existingReminder.id);
};

export const snoozeTaskReminder = async (
  taskId: string,
  reminderAt: string,
): Promise<void> => {
  const task = await getTask(taskId);
  if (task.deletedAt || task.payload.completedAt) return;

  const now = updatedNow(task);
  const updatedTask: TaskDocument = {
    ...task,
    payload: { ...task.payload, reminderAt },
    updatedAt: now,
    updatedByDeviceId: getDeviceId(),
  };
  const reminder = await reminderDocument({
    targetType: 'task',
    targetId: task.id,
    scheduledAt: reminderAt,
    localTime: null,
    weekdays: null,
    enabled: true,
  });

  await saveDocuments([updatedTask, reminder]);
};

export const deleteTask = async (taskId: string): Promise<void> => {
  const task = await getTask(taskId);
  const now = updatedNow(task);
  const deletedTask: TaskDocument = {
    ...task,
    deletedAt: now,
    updatedAt: now,
    updatedByDeviceId: getDeviceId(),
  };
  const existingReminder = await reminderFor('task', taskId);
  if (!existingReminder) {
    await saveDocument(deletedTask);
    return;
  }

  await saveDocuments([
    deletedTask,
    {
      ...existingReminder,
      deletedAt: now,
      updatedAt: now,
      updatedByDeviceId: getDeviceId(),
    },
  ]);
};

export const setCheckInReminder = async (
  kind: CheckInKind,
  localTime: string | null,
): Promise<void> => {
  const existingReminder = await reminderFor('check-in', kind);
  if (!localTime && !existingReminder) return;

  const reminder = await reminderDocument({
    targetType: 'check-in',
    targetId: kind,
    scheduledAt: null,
    localTime: localTime ?? existingReminder?.payload.localTime ?? '09:00',
    weekdays: allWeekdays,
    enabled: Boolean(localTime),
  });
  await saveDocument(reminder);
};

export const findReminder = reminderFor;

export const migrateLegacyHabitReminders = async (): Promise<void> => {
  const habits = await database.documents
    .where('type')
    .equals('habit')
    .toArray();

  for (const document of habits) {
    if (
      document.type !== 'habit' ||
      document.deletedAt ||
      !document.payload.reminderTime ||
      (await reminderFor('habit', document.id))
    ) {
      continue;
    }

    await saveDocument(
      await reminderDocument({
        targetType: 'habit',
        targetId: document.id,
        scheduledAt: null,
        localTime: document.payload.reminderTime,
        weekdays: document.payload.weekdays,
        enabled: !document.payload.archivedAt,
      }),
    );
  }
};

export const findCheckIn = async (
  kind: CheckInKind,
  localDate: string,
): Promise<CheckInDocument | undefined> => {
  const checkIns = await database.documents
    .where('type')
    .equals('check-in')
    .toArray();

  const document = checkIns.find(
    (candidate) =>
      candidate.type === 'check-in' &&
      candidate.payload.kind === kind &&
      candidate.payload.localDate === localDate &&
      !candidate.deletedAt,
  );

  return document?.type === 'check-in' ? document : undefined;
};

export const getOrCreateCheckIn = async (
  kind: CheckInKind,
  date = new Date(),
): Promise<CheckInDocument> => {
  const localDate = localDateFor(date);
  const existingCheckIn = await findCheckIn(kind, localDate);

  if (existingCheckIn) {
    return existingCheckIn;
  }

  const now = new Date().toISOString();
  const checkIn = createCheckInDocument({
    id: createDocumentId(),
    now,
    deviceId: getDeviceId(),
    payload: {
      kind,
      localDate,
      timezone: currentTimezone(),
      status: 'draft',
      currentStep: 0,
      mood: null,
      energy: null,
      stress: null,
      emotions: [],
      responses: selectCuratedPrompts(kind, localDate).map((prompt) => ({
        promptId: prompt.id,
        promptText: prompt.text,
        source: 'curated',
        answer: null,
        skipped: false,
      })),
      reflectionMarkdown: null,
      completedAt: null,
    },
  });

  await saveDocument(checkIn);
  return checkIn;
};

export const getOrCreateMorningCheckIn = (): Promise<CheckInDocument> =>
  getOrCreateCheckIn('morning');

export const updateCheckIn = async (
  checkInId: string,
  update: (payload: CheckInPayload) => CheckInPayload,
): Promise<CheckInDocument> => {
  const document = await database.documents.get(checkInId);

  if (document?.type !== 'check-in') {
    throw new Error(`Check-in ${checkInId} was not found.`);
  }

  if (document.payload.status === 'completed') {
    throw new Error('A completed check-in cannot be changed.');
  }

  const updatedDocument = parseDomainDocument({
    ...document,
    payload: update(document.payload),
    updatedAt: updatedNow(document),
    updatedByDeviceId: getDeviceId(),
  });

  if (updatedDocument.type !== 'check-in') {
    throw new Error('Expected an updated check-in document.');
  }

  await saveDocument(updatedDocument);
  return updatedDocument;
};

export const deleteCheckIn = async (checkInId: string): Promise<void> => {
  const document = await database.documents.get(checkInId);

  if (document?.type !== 'check-in') {
    throw new Error(`Check-in ${checkInId} was not found.`);
  }

  const deletedAt = updatedNow(document);
  await saveDocument({
    ...document,
    deletedAt,
    updatedAt: deletedAt,
    updatedByDeviceId: getDeviceId(),
  });
};

export const documentTable = () => database.documents;
