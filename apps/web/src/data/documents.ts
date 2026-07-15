import {
  type CheckInDocument,
  type CheckInKind,
  type CheckInPayload,
  compareDocumentVersions,
  createCheckInDocument,
  createDocumentId,
  createHabitDocument,
  createHabitLogDocument,
  createJournalDocument,
  createReminderDocument,
  createSettingsDocument,
  createTaskDocument,
  type DomainDocument,
  type HabitDocument,
  type HabitLogDocument,
  type HabitLogPayload,
  type HabitPayload,
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
} from '@mindfull/domain';
import { database } from './database';
import { getDeviceId } from './device';
import { documentsChanged, localDocumentsChanged } from './events';
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

export const saveDocuments = async (
  documents: DomainDocument[],
): Promise<void> => {
  const validatedDocuments = documents.map(parseDomainDocument);

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
    return existingSettings;
  }

  const now = new Date().toISOString();
  const settings = createSettingsDocument({
    id: settingsId,
    now,
    deviceId: getDeviceId(),
    payload: {
      timezone: currentTimezone(),
      theme: 'system',
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

export const createHabit = async (
  input: Pick<HabitPayload, 'name' | 'weekdays' | 'reminderTime'>,
): Promise<HabitDocument> => {
  const now = new Date().toISOString();
  const habit = createHabitDocument({
    id: createDocumentId(),
    now,
    deviceId: getDeviceId(),
    payload: { ...input, archivedAt: null },
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
  const updatedDocument = parseDomainDocument({
    ...habit,
    payload: { ...habit.payload, ...update },
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

export const setHabitArchived = async (
  habitId: string,
  isArchived: boolean,
): Promise<void> => {
  const habit = await getHabit(habitId);
  const now = updatedNow(habit);

  const updatedHabit: HabitDocument = {
    ...habit,
    payload: { ...habit.payload, archivedAt: isArchived ? now : null },
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

export const swapTaskOrder = async (
  firstTaskId: string,
  secondTaskId: string,
): Promise<void> => {
  const [firstTask, secondTask] = await Promise.all([
    getTask(firstTaskId),
    getTask(secondTaskId),
  ]);
  const now = nextDocumentTimestamp(
    firstTask.updatedAt > secondTask.updatedAt
      ? firstTask.updatedAt
      : secondTask.updatedAt,
    new Date().toISOString(),
  );
  const deviceId = getDeviceId();

  await saveDocuments([
    {
      ...firstTask,
      sortKey: secondTask.sortKey,
      updatedAt: now,
      updatedByDeviceId: deviceId,
    },
    {
      ...secondTask,
      sortKey: firstTask.sortKey,
      updatedAt: now,
      updatedByDeviceId: deviceId,
    },
  ]);
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

export const documentTable = () => database.documents;
