import { createHash, randomUUID } from 'node:crypto';
import {
  createHabitSuggestionDocument,
  createReflectionMemoryDocument,
  createTaskSuggestionDocument,
  createWeeklyReflectionDocument,
  type ReflectionMemoryDocument,
  type ReflectionMemorySections,
  type WeeklyReflectionDocument,
} from '@mindfull/domain';
import { NoObjectGeneratedError } from 'ai';
import { eq } from 'drizzle-orm';

import type { MindfullDatabase } from '../database/database.js';
import { findDocument, storeDocument } from '../database/documents.js';
import { aiJobs, aiMemoryBuilds } from '../database/schema.js';
import {
  type AiInvoker,
  aiInvoker,
  loadProviderModels,
  type ProviderConfiguration,
  ProviderResponseError,
  providerErrorCode,
  type ReflectionInput,
  type ReflectionOutput,
} from './provider.js';
import {
  analysisVersion,
  currentWeekReflectionId,
  findCurrentWeekReflection,
  findDomainDocument,
  findReflectionMemory,
  historicalSources,
  nextWaitingJob,
  readAiConfiguration,
  reconcileReflectionJobs,
  recordProviderState,
  reflectionMemoryId,
  reflectionOrganization,
  sourceText,
} from './store.js';

const workerIntervalMs = 5_000;
const leaseMarginMs = 60_000;
const initialBatchCharacters = 20_000;
const serverDeviceId = 'mindfull-server';

const backoffMs = [
  15_000,
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 3_600_000,
  6 * 3_600_000,
];

export const providerBackoffMs = (failureCount: number): number =>
  backoffMs[Math.min(Math.max(failureCount - 1, 0), backoffMs.length - 1)] ??
  6 * 3_600_000;

export const jobLeaseDurationMs = (responseTimeoutMinutes: number): number =>
  responseTimeoutMinutes * 60_000 + leaseMarginMs;

export type AiOutputAttemptDiagnostic = {
  attempt: 1 | 2;
  failure: 'json-parse' | 'schema-validation';
  finishReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  issues: string[];
};

class InvalidOutputError extends Error {
  constructor(readonly attempts: AiOutputAttemptDiagnostic[]) {
    super('The model returned invalid structured output.');
  }
}

const validationIssuesFrom = (error: unknown): string[] => {
  let current = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== 'object' || current === null) return [];
    const candidate = current as { cause?: unknown; issues?: unknown };
    if (Array.isArray(candidate.issues)) {
      return candidate.issues
        .flatMap((issue) => {
          if (typeof issue !== 'object' || issue === null) return [];
          const detail = issue as { code?: unknown; path?: unknown };
          const code =
            typeof detail.code === 'string' ? detail.code : 'invalid';
          const path = Array.isArray(detail.path)
            ? detail.path.map(String).join('.')
            : '';
          return [`${path || 'output'}:${code}`];
        })
        .slice(0, 20);
    }
    current = candidate.cause;
  }
  return [];
};

export const outputAttemptDiagnostic = (
  error: InstanceType<typeof NoObjectGeneratedError>,
  attempt: 1 | 2,
): AiOutputAttemptDiagnostic => {
  return {
    attempt,
    failure: error.message.includes('could not parse')
      ? 'json-parse'
      : 'schema-validation',
    finishReason: error.finishReason ?? null,
    inputTokens: error.usage?.inputTokens ?? null,
    outputTokens: error.usage?.outputTokens ?? null,
    totalTokens: error.usage?.totalTokens ?? null,
    issues: validationIssuesFrom(error),
  };
};
class StaleMemoryError extends Error {}

const providerConfiguration = (
  configuration: NonNullable<ReturnType<typeof readAiConfiguration>>,
): ProviderConfiguration | null =>
  configuration.model
    ? {
        baseUrl: configuration.baseUrl,
        apiKey: configuration.apiKey,
        model: configuration.model,
        responseTimeoutMinutes: configuration.responseTimeoutMinutes,
      }
    : null;

const invalidConfigurationError = (error: unknown): boolean => {
  const code = providerErrorCode(error);
  return [
    'access-denied',
    'authentication-failed',
    'invalid-model-list',
    'models-endpoint-not-found',
    'provider-rejected-request',
    'selected-model-unavailable',
  ].includes(code);
};

const invokeReflection = async (
  invoker: AiInvoker,
  configuration: ProviderConfiguration,
  input: ReflectionInput,
): Promise<ReflectionOutput> => {
  let firstFailure: AiOutputAttemptDiagnostic;
  try {
    return await invoker.reflect(configuration, input);
  } catch (error) {
    if (!NoObjectGeneratedError.isInstance(error)) {
      throw error;
    }
    firstFailure = outputAttemptDiagnostic(error, 1);
  }

  try {
    return await invoker.reflect(configuration, {
      ...input,
      correction:
        'The previous response did not match the required schema. Return only a complete valid result.',
    });
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      throw new InvalidOutputError([
        firstFailure,
        outputAttemptDiagnostic(error, 2),
      ]);
    }
    throw error;
  }
};

const memoryDocument = (
  existing: ReflectionMemoryDocument | null,
  sections: ReflectionMemorySections,
  updatedFromDocumentIds: string[],
  configuration: ProviderConfiguration,
  now: string,
): ReflectionMemoryDocument => {
  if (!existing) {
    return createReflectionMemoryDocument({
      id: reflectionMemoryId,
      payload: {
        revision: 1,
        markdown: reflectionMemoryMarkdownFor(sections),
        sections,
        updatedFromDocumentIds,
        generatedAt: now,
        provider: 'openai-compatible',
        model: configuration.model,
        analysisVersion,
      },
      now,
      deviceId: serverDeviceId,
    });
  }

  return {
    ...existing,
    payload: {
      ...existing.payload,
      revision: existing.payload.revision + 1,
      markdown: reflectionMemoryMarkdownFor(sections),
      sections,
      updatedFromDocumentIds,
      generatedAt: now,
      model: configuration.model,
      analysisVersion,
    },
    updatedAt: now,
    updatedByDeviceId: serverDeviceId,
  };
};

const deterministicSuggestionId = (
  kind: 'task' | 'habit',
  jobId: string,
  index: number,
): string =>
  `${kind}-suggestion:${createHash('sha256').update(`${jobId}:${kind}:${index}`).digest('hex').slice(0, 24)}`;

export const reflectionMemoryMarkdown = (markdown: string): string =>
  markdown.replace(/^\s*#\s+[^\n]+\n+/u, '').trim();

const memorySectionLabels: Array<[keyof ReflectionMemorySections, string]> = [
  ['context', 'Context worth remembering'],
  ['supportivePatterns', 'What appears supportive'],
  ['recurringThemes', 'Recurring themes'],
  ['ongoingCommitments', 'Ongoing commitments'],
  ['openQuestions', 'Open questions'],
  ['uncertainImpressions', 'Uncertain impressions'],
];

export const reflectionMemoryMarkdownFor = (
  sections: ReflectionMemorySections,
): string =>
  memorySectionLabels
    .map(([key, label]) => {
      const items = sections[key];
      return [
        `## ${label}`,
        ...(items.length
          ? items.map((item) => `- ${item}`)
          : ['- None noted.']),
      ].join('\n');
    })
    .join('\n\n');

const shiftLocalDate = (localDate: string, days: number): string => {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days))
    .toISOString()
    .slice(0, 10);
};

export const weekBounds = (localDate: string) => {
  const weekday = new Date(`${localDate}T12:00:00Z`).getUTCDay();
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  const weekStart = shiftLocalDate(localDate, -daysSinceMonday);
  return { weekStart, weekEnd: shiftLocalDate(weekStart, 6) };
};

const weeklyDocument = (
  existing: WeeklyReflectionDocument | null,
  output: ReflectionOutput['updatedWeek'],
  sourceId: string,
  localDate: string,
  configuration: ProviderConfiguration,
  now: string,
): WeeklyReflectionDocument => {
  const bounds = weekBounds(localDate);
  const continuesWeek = existing?.payload.weekStart === bounds.weekStart;
  const sourceIds = continuesWeek
    ? [...existing.payload.updatedFromDocumentIds, sourceId].slice(-100)
    : [sourceId];

  if (!existing) {
    return createWeeklyReflectionDocument({
      id: currentWeekReflectionId,
      payload: {
        revision: 1,
        ...bounds,
        sections: output,
        updatedFromDocumentIds: sourceIds,
        generatedAt: now,
        provider: 'openai-compatible',
        model: configuration.model,
        analysisVersion,
      },
      now,
      deviceId: serverDeviceId,
    });
  }

  return {
    ...existing,
    payload: {
      revision: existing.payload.revision + 1,
      ...bounds,
      sections: output,
      updatedFromDocumentIds: sourceIds,
      generatedAt: now,
      provider: 'openai-compatible',
      model: configuration.model,
      analysisVersion,
    },
    updatedAt: now,
    updatedByDeviceId: serverDeviceId,
  };
};

const normalizedSuggestion = (text: string): string =>
  text
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const completeAnalysis = (
  database: MindfullDatabase,
  job: typeof aiJobs.$inferSelect,
  output: ReflectionOutput,
  configuration: ProviderConfiguration,
  expectedMemory: ReflectionMemoryDocument | null,
  expectedWeek: WeeklyReflectionDocument | null,
  now: string,
): void => {
  const source = job.sourceDocumentId
    ? findDomainDocument(database, job.sourceDocumentId)
    : null;
  if (
    !source ||
    (source.type !== 'journal' && source.type !== 'check-in') ||
    !job.sourceContentHash
  ) {
    throw new Error('The reflection source is unavailable.');
  }

  const nextMemory = memoryDocument(
    expectedMemory,
    output.updatedMemory,
    [source.id],
    configuration,
    now,
  );
  const nextWeek = weeklyDocument(
    expectedWeek,
    output.updatedWeek,
    source.id,
    source.payload.localDate,
    configuration,
    now,
  );
  const organization = reflectionOrganization(database);
  const existingTaskTexts = new Set(
    [...organization.activeTasks, ...organization.pendingTaskSuggestions].map(
      normalizedSuggestion,
    ),
  );
  const existingHabitNames = new Set(
    [
      ...organization.activeHabits.map(({ name }) => name),
      ...organization.pendingHabitSuggestions,
    ].map(normalizedSuggestion),
  );
  const taskSuggestions = output.taskSuggestions
    .filter(({ text }) => {
      const normalized = normalizedSuggestion(text);
      if (!normalized || existingTaskTexts.has(normalized)) return false;
      existingTaskTexts.add(normalized);
      return true;
    })
    .map(({ text, reason }, index) =>
      createTaskSuggestionDocument({
        id: deterministicSuggestionId('task', job.id, index),
        payload: {
          proposedText: text,
          reason,
          availableFrom: null,
          sourceDocumentId: source.id,
          sourceContentHash: job.sourceContentHash ?? '',
          state: 'pending',
          acceptedTaskId: null,
        },
        now,
        parentId: source.id,
        deviceId: serverDeviceId,
      }),
    );
  const habitSuggestions = output.habitSuggestions
    .filter(({ text }) => {
      const normalized = normalizedSuggestion(text);
      if (!normalized || existingHabitNames.has(normalized)) return false;
      existingHabitNames.add(normalized);
      return true;
    })
    .map(({ text, reason }, index) =>
      createHabitSuggestionDocument({
        id: deterministicSuggestionId('habit', job.id, index),
        payload: {
          proposedName: text,
          reason,
          sourceDocumentId: source.id,
          sourceContentHash: job.sourceContentHash ?? '',
          state: 'pending',
          acceptedHabitId: null,
        },
        now,
        parentId: source.id,
        deviceId: serverDeviceId,
      }),
    );

  database.transaction((transaction) => {
    const currentMemory = findDocument(transaction, reflectionMemoryId);
    const currentRevision =
      currentMemory?.type === 'reflection-memory' && !currentMemory.deletedAt
        ? currentMemory.payload.revision
        : null;
    if (currentRevision !== (expectedMemory?.payload.revision ?? null)) {
      throw new StaleMemoryError('Reflection memory changed during inference.');
    }
    const currentWeek = findDocument(transaction, currentWeekReflectionId);
    const currentWeekRevision =
      currentWeek?.type === 'weekly-reflection' && !currentWeek.deletedAt
        ? currentWeek.payload.revision
        : null;
    if (currentWeekRevision !== (expectedWeek?.payload.revision ?? null)) {
      throw new StaleMemoryError(
        'The current-week reflection changed during inference.',
      );
    }

    for (const document of [
      nextMemory,
      nextWeek,
      ...taskSuggestions,
      ...habitSuggestions,
    ]) {
      storeDocument(transaction, document);
    }
    transaction
      .update(aiJobs)
      .set({
        state: 'completed',
        completedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastErrorCode: null,
      })
      .where(eq(aiJobs.id, job.id))
      .run();
  });
};

const processAnalysis = async (
  database: MindfullDatabase,
  job: typeof aiJobs.$inferSelect,
  configuration: ProviderConfiguration,
  invoker: AiInvoker,
  now: string,
): Promise<void> => {
  const source = job.sourceDocumentId
    ? findDomainDocument(database, job.sourceDocumentId)
    : null;
  if (!source || (source.type !== 'journal' && source.type !== 'check-in')) {
    throw new Error('The reflection source is unavailable.');
  }
  const text = sourceText(source);
  if (!text.trim()) {
    database
      .update(aiJobs)
      .set({ state: 'completed', completedAt: now })
      .where(eq(aiJobs.id, job.id))
      .run();
    return;
  }

  const memory = findReflectionMemory(database);
  const currentWeek = findCurrentWeekReflection(database);
  const bounds = weekBounds(source.payload.localDate);
  const organization = reflectionOrganization(database);
  const output = await invokeReflection(invoker, configuration, {
    memoryMarkdown: memory?.payload.markdown ?? '',
    memorySections: memory?.payload.sections ?? null,
    currentWeek:
      currentWeek?.payload.weekStart === bounds.weekStart
        ? {
            weekStart: currentWeek.payload.weekStart,
            weekEnd: currentWeek.payload.weekEnd,
            sections: currentWeek.payload.sections,
          }
        : null,
    ...organization,
    sourceKind: source.type,
    sourceLocalDate: source.payload.localDate,
    sourceText: text,
  });
  completeAnalysis(
    database,
    job,
    output,
    configuration,
    memory,
    currentWeek,
    now,
  );
};

const initialBatch = (
  sources: ReturnType<typeof historicalSources>,
  startIndex: number,
) => {
  const selected = [] as typeof sources;
  let characters = 0;
  for (const source of sources.slice(startIndex)) {
    const length = sourceText(source).length;
    if (selected.length && characters + length > initialBatchCharacters) break;
    selected.push(source);
    characters += length;
  }
  return selected;
};

const processInitialMemory = async (
  database: MindfullDatabase,
  job: typeof aiJobs.$inferSelect,
  configuration: ProviderConfiguration,
  invoker: AiInvoker,
  now: string,
): Promise<void> => {
  const build = database
    .select()
    .from(aiMemoryBuilds)
    .where(eq(aiMemoryBuilds.jobId, job.id))
    .get();
  if (!build) throw new Error('The initial memory build is unavailable.');

  const sources = historicalSources(database, now);
  const batch = initialBatch(sources, build.nextSourceIndex);
  if (!batch.length) throw new Error('There are no reflections to remember.');
  const output = await invokeReflection(invoker, configuration, {
    memoryMarkdown: build.markdown,
    memorySections: null,
    currentWeek: null,
    activeTasks: [],
    activeHabits: [],
    pendingTaskSuggestions: [],
    pendingHabitSuggestions: [],
    sourceKind: 'memory-batch',
    sourceLocalDate: null,
    sourceText: batch
      .map((source) =>
        [`[${source.occurredAt ?? source.createdAt}]`, sourceText(source)].join(
          '\n',
        ),
      )
      .join('\n\n---\n\n'),
  });
  const nextIndex = build.nextSourceIndex + batch.length;
  const sourceDocumentIds = [
    ...(JSON.parse(build.sourceDocumentIds) as string[]),
    ...batch.map(({ id }) => id),
  ];

  if (nextIndex < sources.length) {
    database.transaction((transaction) => {
      transaction
        .update(aiMemoryBuilds)
        .set({
          markdown: reflectionMemoryMarkdownFor(output.updatedMemory),
          nextSourceIndex: nextIndex,
          sourceDocumentIds: JSON.stringify(sourceDocumentIds),
          updatedAt: now,
        })
        .where(eq(aiMemoryBuilds.jobId, job.id))
        .run();
      transaction
        .update(aiJobs)
        .set({ state: 'waiting', leaseOwner: null, leaseExpiresAt: null })
        .where(eq(aiJobs.id, job.id))
        .run();
    });
    return;
  }

  const memory = memoryDocument(
    null,
    output.updatedMemory,
    sourceDocumentIds.slice(-100),
    configuration,
    now,
  );
  database.transaction((transaction) => {
    const currentMemory = findDocument(transaction, reflectionMemoryId);
    if (currentMemory && !currentMemory.deletedAt) {
      throw new StaleMemoryError(
        'Reflection memory was created during initialization.',
      );
    }
    storeDocument(transaction, memory);
    transaction
      .delete(aiMemoryBuilds)
      .where(eq(aiMemoryBuilds.jobId, job.id))
      .run();
    transaction
      .update(aiJobs)
      .set({
        state: 'completed',
        completedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
      })
      .where(eq(aiJobs.id, job.id))
      .run();
  });
};

const providerFailure = (
  database: MindfullDatabase,
  failureCount: number,
  now: string,
  errorCode: string,
  isInvalid: boolean,
) => {
  recordProviderState(database, {
    status: isInvalid ? 'invalid-configuration' : 'unavailable',
    checkedAt: now,
    nextCheckAt: isInvalid
      ? null
      : new Date(
          Date.parse(now) + providerBackoffMs(failureCount),
        ).toISOString(),
    failureCount,
    errorCode,
  });
};

export type AiWorker = {
  wake: () => void;
  stop: () => Promise<void>;
};

export type AiWorkerFailure = {
  terminal: boolean;
  jobId: string;
  jobKind: string;
  attemptCount: number;
  errorCode: string;
  outputAttempts: AiOutputAttemptDiagnostic[];
};

export const startAiWorker = (
  database: MindfullDatabase,
  options: {
    invoker?: AiInvoker;
    modelLoader?: typeof loadProviderModels;
    onError?: (failure: AiWorkerFailure) => void;
  } = {},
): AiWorker => {
  const invoker = options.invoker ?? aiInvoker;
  const modelLoader = options.modelLoader ?? loadProviderModels;
  const workerId = randomUUID();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let isRunning = false;
  let isStopped = false;

  const schedule = (delayMs = workerIntervalMs) => {
    if (timer) clearTimeout(timer);
    if (!isStopped) timer = setTimeout(() => void run(), delayMs);
  };

  const run = async () => {
    if (isRunning || isStopped) return;
    isRunning = true;
    const now = new Date().toISOString();
    try {
      reconcileReflectionJobs(database, now);
      const stored = readAiConfiguration(database);
      const configuration = stored && providerConfiguration(stored);
      if (
        !stored ||
        !configuration ||
        stored.paused ||
        stored.status === 'invalid-configuration' ||
        (stored.nextCheckAt && stored.nextCheckAt > now)
      ) {
        return;
      }

      let models: string[];
      try {
        models = await modelLoader(stored.baseUrl, stored.apiKey);
        if (!models.includes(configuration.model)) {
          throw new ProviderResponseError(
            404,
            'The selected model is unavailable.',
            'selected-model-unavailable',
          );
        }
        recordProviderState(database, {
          status: 'available',
          checkedAt: now,
          nextCheckAt: null,
          failureCount: 0,
          errorCode: null,
        });
      } catch (error) {
        providerFailure(
          database,
          stored.failureCount + 1,
          now,
          providerErrorCode(error),
          invalidConfigurationError(error),
        );
        return;
      }

      const job = nextWaitingJob(database, now);
      if (!job) return;
      database
        .update(aiJobs)
        .set({
          state: 'running',
          leaseOwner: workerId,
          leaseExpiresAt: new Date(
            Date.parse(now) +
              jobLeaseDurationMs(configuration.responseTimeoutMinutes),
          ).toISOString(),
          attemptCount: job.attemptCount + 1,
        })
        .where(eq(aiJobs.id, job.id))
        .run();

      try {
        if (job.kind === 'initialize-memory') {
          await processInitialMemory(
            database,
            job,
            configuration,
            invoker,
            now,
          );
        } else {
          await processAnalysis(database, job, configuration, invoker, now);
        }
      } catch (error) {
        const terminal = error instanceof InvalidOutputError;
        database
          .update(aiJobs)
          .set({
            state: terminal ? 'failed' : 'waiting',
            leaseOwner: null,
            leaseExpiresAt: null,
            lastErrorCode: terminal ? 'invalid-output' : 'provider-error',
          })
          .where(eq(aiJobs.id, job.id))
          .run();
        if (!(error instanceof StaleMemoryError) && !terminal) {
          providerFailure(
            database,
            1,
            now,
            providerErrorCode(error),
            invalidConfigurationError(error),
          );
        }
        if (terminal) {
          providerFailure(database, 0, now, 'structured-output', true);
        }
        options.onError?.({
          terminal,
          jobId: job.id,
          jobKind: job.kind,
          attemptCount: job.attemptCount + 1,
          errorCode: terminal ? 'structured-output' : providerErrorCode(error),
          outputAttempts:
            error instanceof InvalidOutputError ? error.attempts : [],
        });
      }
    } finally {
      isRunning = false;
      schedule();
    }
  };

  schedule(0);
  return {
    wake: () => schedule(0),
    async stop() {
      isStopped = true;
      if (timer) clearTimeout(timer);
      while (isRunning) await new Promise((resolve) => setTimeout(resolve, 10));
    },
  };
};
