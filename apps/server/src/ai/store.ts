import { createHash } from 'node:crypto';
import type {
  CheckInDocument,
  DomainDocument,
  JournalDocument,
  ReflectionMemoryDocument,
  WeeklyReflectionDocument,
} from '@mindfull/domain';
import { and, asc, eq, inArray, isNull, lte, or } from 'drizzle-orm';
import type { MindfullDatabase } from '../database/database.js';
import { documentFromRow, storeDocument } from '../database/documents.js';
import {
  aiConfiguration,
  aiJobs,
  aiMemoryBuilds,
  documents,
} from '../database/schema.js';

export const aiConfigurationId = 'primary';
export const reflectionMemoryId = 'reflection-memory';
export const currentWeekReflectionId = 'current-week-reflection';
export const analysisVersion = 2;
export const defaultResponseTimeoutMinutes = 5;
export const responseTimeoutMinutes = [2, 5, 10, 20] as const;
export type ResponseTimeoutMinutes = (typeof responseTimeoutMinutes)[number];

export type AiProviderStatus =
  | 'not-configured'
  | 'checking'
  | 'available'
  | 'unavailable'
  | 'invalid-configuration'
  | 'paused';

export type StoredAiConfiguration = {
  baseUrl: string;
  apiKey: string;
  model: string | null;
  responseTimeoutMinutes: ResponseTimeoutMinutes;
  paused: boolean;
  activatedAt: string | null;
  status: AiProviderStatus;
  lastCheckedAt: string | null;
  lastSucceededAt: string | null;
  nextCheckAt: string | null;
  failureCount: number;
  errorCode: string | null;
  updatedAt: string;
};

export const readAiConfiguration = (
  database: MindfullDatabase,
): StoredAiConfiguration | null => {
  const row = database
    .select()
    .from(aiConfiguration)
    .where(eq(aiConfiguration.id, aiConfigurationId))
    .get();

  return row
    ? {
        ...row,
        status: row.status as AiProviderStatus,
        responseTimeoutMinutes:
          row.responseTimeoutMinutes as ResponseTimeoutMinutes,
      }
    : null;
};

export const saveAiConfiguration = (
  database: MindfullDatabase,
  input: {
    baseUrl: string;
    apiKey: string;
    model: string | null;
    responseTimeoutMinutes: ResponseTimeoutMinutes;
  },
  now: string,
): StoredAiConfiguration => {
  const existing = readAiConfiguration(database);
  const activatedAt = existing?.activatedAt ?? (input.model ? now : null);

  database
    .insert(aiConfiguration)
    .values({
      id: aiConfigurationId,
      ...input,
      paused: false,
      activatedAt,
      status: input.model ? 'checking' : 'not-configured',
      lastCheckedAt: null,
      lastSucceededAt: existing?.lastSucceededAt ?? null,
      nextCheckAt: null,
      failureCount: 0,
      errorCode: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: aiConfiguration.id,
      set: {
        ...input,
        activatedAt,
        status: input.model ? 'checking' : 'not-configured',
        nextCheckAt: null,
        failureCount: 0,
        errorCode: null,
        updatedAt: now,
      },
    })
    .run();

  const saved = readAiConfiguration(database);
  if (!saved) throw new Error('AI configuration was not saved.');
  return saved;
};

export const setAiPaused = (
  database: MindfullDatabase,
  paused: boolean,
  now: string,
): void => {
  database
    .update(aiConfiguration)
    .set({
      paused,
      status: paused ? 'paused' : 'checking',
      nextCheckAt: null,
      updatedAt: now,
    })
    .where(eq(aiConfiguration.id, aiConfigurationId))
    .run();
};

export const recordProviderState = (
  database: MindfullDatabase,
  state: {
    status: AiProviderStatus;
    checkedAt: string;
    nextCheckAt: string | null;
    failureCount: number;
    errorCode: string | null;
  },
): void => {
  database
    .update(aiConfiguration)
    .set({
      status: state.status,
      lastCheckedAt: state.checkedAt,
      lastSucceededAt:
        state.status === 'available' ? state.checkedAt : undefined,
      nextCheckAt: state.nextCheckAt,
      failureCount: state.failureCount,
      errorCode: state.errorCode,
      updatedAt: state.checkedAt,
    })
    .where(eq(aiConfiguration.id, aiConfigurationId))
    .run();
};

export const sourceText = (
  document: JournalDocument | CheckInDocument,
): string => {
  if (document.type === 'journal') {
    return [document.payload.title, document.payload.markdown]
      .filter(Boolean)
      .join('\n\n');
  }

  const namedValues = [
    ['Mood', document.payload.mood],
    ['Energy', document.payload.energy],
    ['Stress', document.payload.stress],
    ['Emotions', document.payload.emotions.join(', ')],
  ]
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}: ${value}`);
  const responses = document.payload.responses
    .filter(({ skipped, answer }) => !skipped && answer)
    .map(({ promptText, answer }) => `${promptText}\n${answer}`);

  return [...namedValues, ...responses, document.payload.reflectionMarkdown]
    .filter(Boolean)
    .join('\n\n');
};

export const sourceContentHash = (
  document: JournalDocument | CheckInDocument,
): string => createHash('sha256').update(sourceText(document)).digest('hex');

const completedSources = (database: MindfullDatabase) =>
  database
    .select()
    .from(documents)
    .where(
      and(
        inArray(documents.type, ['journal', 'check-in']),
        isNull(documents.deletedAt),
      ),
    )
    .orderBy(asc(documents.occurredAt))
    .all()
    .map(documentFromRow)
    .filter(
      (document): document is JournalDocument | CheckInDocument =>
        (document.type === 'journal' &&
          document.payload.status === 'completed') ||
        (document.type === 'check-in' &&
          document.payload.status === 'completed'),
    );

export const reconcileReflectionJobs = (
  database: MindfullDatabase,
  now: string,
): number => {
  const configuration = readAiConfiguration(database);
  if (!configuration?.activatedAt) return 0;

  let created = 0;
  for (const source of completedSources(database)) {
    const completedAt = source.payload.completedAt ?? source.occurredAt;
    if (!completedAt || completedAt < configuration.activatedAt) continue;
    const hash = sourceContentHash(source);
    const id = `analyze:${source.id}:${hash}:v${analysisVersion}`;
    const result = database
      .insert(aiJobs)
      .values({
        id,
        kind: 'analyze-reflection',
        sourceDocumentId: source.id,
        sourceContentHash: hash,
        recordedAt: completedAt,
        state: 'waiting',
        attemptCount: 0,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastErrorCode: null,
        createdAt: now,
        completedAt: null,
      })
      .onConflictDoNothing()
      .run();
    created += Number(result.changes);
  }
  return created;
};

export const resetAndQueueReflectionRebuild = (
  database: MindfullDatabase,
  now: string,
  week: { weekStart: string; weekEnd: string },
): boolean => {
  if (database.select().from(aiMemoryBuilds).get()) return false;

  const id = 'rebuild-reflections:v1';
  database.transaction((transaction) => {
    const generatedDocuments = transaction
      .select()
      .from(documents)
      .where(
        inArray(documents.type, [
          'reflection-memory',
          'weekly-reflection',
          'task-suggestion',
          'habit-suggestion',
        ]),
      )
      .all()
      .map(documentFromRow)
      .filter((document) => {
        if (document.deletedAt) return false;
        if (
          document.type === 'reflection-memory' ||
          document.type === 'weekly-reflection'
        ) {
          return true;
        }
        return (
          (document.type === 'task-suggestion' ||
            document.type === 'habit-suggestion') &&
          document.payload.state === 'pending'
        );
      });

    for (const document of generatedDocuments) {
      storeDocument(transaction, {
        ...document,
        deletedAt: now,
        updatedAt: now,
        updatedByDeviceId: 'mindfull-server',
      });
    }

    transaction.delete(aiMemoryBuilds).run();
    transaction
      .delete(aiJobs)
      .where(inArray(aiJobs.kind, ['initialize-memory', 'rebuild-reflections']))
      .run();
    transaction
      .update(aiJobs)
      .set({
        state: 'completed',
        completedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
      })
      .where(
        and(
          eq(aiJobs.kind, 'analyze-reflection'),
          inArray(aiJobs.state, ['waiting', 'running', 'failed']),
        ),
      )
      .run();

    transaction
      .insert(aiJobs)
      .values({
        id,
        kind: 'rebuild-reflections',
        sourceDocumentId: null,
        sourceContentHash: null,
        recordedAt: '0000-01-01T00:00:00.000Z',
        state: 'waiting',
        attemptCount: 0,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastErrorCode: null,
        createdAt: now,
        completedAt: null,
      })
      .run();
    transaction
      .insert(aiMemoryBuilds)
      .values({
        jobId: id,
        markdown: '',
        memorySections: null,
        nextSourceIndex: 0,
        sourceDocumentIds: '[]',
        phase: 'memory',
        weekStart: week.weekStart,
        weekEnd: week.weekEnd,
        weekSections: null,
        weekSourceIndex: 0,
        weekSourceDocumentIds: '[]',
        updatedAt: now,
      })
      .run();
  });
  return true;
};

export const historicalSources = (
  database: MindfullDatabase,
  now: string,
): Array<JournalDocument | CheckInDocument> => {
  const oneYearAgo = new Date(now);
  oneYearAgo.setUTCFullYear(oneYearAgo.getUTCFullYear() - 1);
  return completedSources(database).filter((source) => {
    const completedAt = source.payload.completedAt ?? source.occurredAt;
    return (
      completedAt &&
      completedAt >= oneYearAgo.toISOString() &&
      completedAt < now
    );
  });
};

export const currentWeekSources = (
  database: MindfullDatabase,
  weekStart: string | null,
  weekEnd: string | null,
): Array<JournalDocument | CheckInDocument> => {
  if (!weekStart || !weekEnd) return [];
  return completedSources(database).filter(
    (source) =>
      source.payload.localDate >= weekStart &&
      source.payload.localDate <= weekEnd,
  );
};

export type ReflectionRebuildProgress = {
  state: 'waiting' | 'running' | 'failed';
  phase: 'memory' | 'week';
  processedSources: number;
  totalSources: number;
};

export const reflectionRebuildProgress = (
  database: MindfullDatabase,
  now: string,
): ReflectionRebuildProgress | null => {
  const build = database.select().from(aiMemoryBuilds).get();
  if (!build) return null;

  const job = database
    .select()
    .from(aiJobs)
    .where(eq(aiJobs.id, build.jobId))
    .get();
  if (job?.kind !== 'rebuild-reflections') return null;

  const state = ['running', 'failed'].includes(job.state)
    ? (job.state as 'running' | 'failed')
    : 'waiting';
  const isWeek = build.phase === 'week';
  const totalSources = Math.max(
    isWeek ? build.weekSourceIndex : build.nextSourceIndex,
    isWeek
      ? currentWeekSources(database, build.weekStart, build.weekEnd).length
      : historicalSources(database, now).length,
  );

  return {
    state,
    phase: isWeek ? 'week' : 'memory',
    processedSources: Math.min(
      isWeek ? build.weekSourceIndex : build.nextSourceIndex,
      totalSources,
    ),
    totalSources,
  };
};

export const findDomainDocument = (
  database: MindfullDatabase,
  id: string,
): DomainDocument | null => {
  const row = database
    .select()
    .from(documents)
    .where(eq(documents.id, id))
    .get();
  return row ? documentFromRow(row) : null;
};

export const findReflectionMemory = (
  database: MindfullDatabase,
): ReflectionMemoryDocument | null => {
  const document = findDomainDocument(database, reflectionMemoryId);
  return document?.type === 'reflection-memory' && !document.deletedAt
    ? document
    : null;
};

export const findCurrentWeekReflection = (
  database: MindfullDatabase,
): WeeklyReflectionDocument | null => {
  const document = findDomainDocument(database, currentWeekReflectionId);
  return document?.type === 'weekly-reflection' && !document.deletedAt
    ? document
    : null;
};

export type ReflectionOrganization = {
  activeTasks: string[];
  activeHabits: Array<{ name: string; weekdays: number[] }>;
  pendingTaskSuggestions: string[];
  pendingHabitSuggestions: string[];
};

export const reflectionOrganization = (
  database: MindfullDatabase,
): ReflectionOrganization => {
  const domainDocuments = database
    .select()
    .from(documents)
    .all()
    .map(documentFromRow)
    .filter((document) => !document.deletedAt);

  return {
    activeTasks: domainDocuments.flatMap((document) =>
      document.type === 'task' && document.payload.completedAt === null
        ? [document.payload.text]
        : [],
    ),
    activeHabits: domainDocuments.flatMap((document) =>
      document.type === 'habit' && document.payload.archivedAt === null
        ? [
            {
              name: document.payload.name,
              weekdays: document.payload.weekdays,
            },
          ]
        : [],
    ),
    pendingTaskSuggestions: domainDocuments.flatMap((document) =>
      document.type === 'task-suggestion' &&
      document.payload.state === 'pending'
        ? [document.payload.proposedText]
        : [],
    ),
    pendingHabitSuggestions: domainDocuments.flatMap((document) =>
      document.type === 'habit-suggestion' &&
      document.payload.state === 'pending'
        ? [document.payload.proposedName]
        : [],
    ),
  };
};

export const nextWaitingJob = (database: MindfullDatabase, now: string) =>
  database
    .select()
    .from(aiJobs)
    .where(
      and(
        or(eq(aiJobs.state, 'waiting'), eq(aiJobs.state, 'running')),
        or(isNull(aiJobs.leaseExpiresAt), lte(aiJobs.leaseExpiresAt, now)),
      ),
    )
    .orderBy(asc(aiJobs.recordedAt), asc(aiJobs.createdAt))
    .get();

export const pendingJobCount = (database: MindfullDatabase): number =>
  database
    .select()
    .from(aiJobs)
    .where(inArray(aiJobs.state, ['waiting', 'running']))
    .all().length;

export const failedJobCount = (database: MindfullDatabase): number =>
  database.select().from(aiJobs).where(eq(aiJobs.state, 'failed')).all().length;

export const retryFailedJobs = (
  database: MindfullDatabase,
  now: string,
): number => {
  const result = database
    .update(aiJobs)
    .set({
      state: 'waiting',
      attemptCount: 0,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastErrorCode: null,
      completedAt: null,
    })
    .where(eq(aiJobs.state, 'failed'))
    .run();
  const configuration = readAiConfiguration(database);
  if (configuration?.status === 'invalid-configuration') {
    recordProviderState(database, {
      status: 'checking',
      checkedAt: now,
      nextCheckAt: null,
      failureCount: 0,
      errorCode: null,
    });
  }
  return Number(result.changes);
};
