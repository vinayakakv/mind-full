import {
  type CheckInDocument,
  type CheckInKind,
  type CheckInPayload,
  compareDocumentVersions,
  createCheckInDocument,
  createDocumentId,
  createJournalDocument,
  createSettingsDocument,
  createTaskDocument,
  type DomainDocument,
  isCheckInScheduleValid,
  type JournalDocument,
  type JournalPayload,
  nextDocumentTimestamp,
  parseDomainDocument,
  type SettingsDocument,
  selectCuratedPrompts,
  type TaskDocument,
} from '@mindfull/domain';
import { database } from './database';
import { getDeviceId } from './device';
import { localDocumentsChanged } from './events';
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

const nextTaskSortKey = (): string => {
  const now = Date.now().toString().padStart(16, '0');
  return `${now}:${createDocumentId()}`;
};

export const addTask = async (text: string): Promise<TaskDocument> => {
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
      reminderAt: null,
      source: { kind: 'manual' },
    },
  });

  await saveDocument(task);
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

const updateTask = async (
  taskId: string,
  update: (task: TaskDocument) => TaskDocument,
): Promise<void> => {
  const task = await getTask(taskId);
  await saveDocument(update(task));
};

export const setTaskCompleted = async (
  taskId: string,
  completed: boolean,
): Promise<void> => {
  await updateTask(taskId, (task) => {
    const now = updatedNow(task);

    return {
      ...task,
      payload: {
        ...task.payload,
        completedAt: completed ? now : null,
      },
      updatedAt: now,
      updatedByDeviceId: getDeviceId(),
    };
  });
};

export const deleteTask = async (taskId: string): Promise<void> => {
  await updateTask(taskId, (task) => {
    const now = updatedNow(task);

    return {
      ...task,
      deletedAt: now,
      updatedAt: now,
      updatedByDeviceId: getDeviceId(),
    };
  });
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
