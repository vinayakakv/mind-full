import {
  type CheckInDocument,
  type CheckInPayload,
  compareDocumentVersions,
  createCheckInDocument,
  createDocumentId,
  createSettingsDocument,
  createTaskDocument,
  type DomainDocument,
  nextDocumentTimestamp,
  parseDomainDocument,
  type SettingsDocument,
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

export const findMorningCheckIn = async (
  localDate: string,
): Promise<CheckInDocument | undefined> => {
  const checkIns = await database.documents
    .where('type')
    .equals('check-in')
    .toArray();

  const document = checkIns.find(
    (candidate) =>
      candidate.type === 'check-in' &&
      candidate.payload.kind === 'morning' &&
      candidate.payload.localDate === localDate &&
      !candidate.deletedAt,
  );

  return document?.type === 'check-in' ? document : undefined;
};

export const getOrCreateMorningCheckIn = async (): Promise<CheckInDocument> => {
  const localDate = localDateFor(new Date());
  const existingCheckIn = await findMorningCheckIn(localDate);

  if (existingCheckIn) {
    return existingCheckIn;
  }

  const now = new Date().toISOString();
  const checkIn = createCheckInDocument({
    id: createDocumentId(),
    now,
    deviceId: getDeviceId(),
    payload: {
      kind: 'morning',
      localDate,
      timezone: currentTimezone(),
      status: 'draft',
      currentStep: 0,
      mood: null,
      energy: null,
      stress: null,
      emotions: [],
      responses: [],
      reflectionMarkdown: null,
      completedAt: null,
    },
  });

  await saveDocument(checkIn);
  return checkIn;
};

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
