import { createHash, randomUUID } from 'node:crypto';
import {
  createAnalysisResultDocument,
  createReflectionMemoryDocument,
  createTaskSuggestionDocument,
  type ReflectionMemoryDocument,
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
  type ReflectionInput,
  type ReflectionOutput,
} from './provider.js';
import {
  analysisVersion,
  findDomainDocument,
  findReflectionMemory,
  historicalSources,
  nextWaitingJob,
  readAiConfiguration,
  reconcileReflectionJobs,
  recordProviderState,
  reflectionMemoryId,
  sourceText,
} from './store.js';

const workerIntervalMs = 5_000;
const leaseDurationMs = 5 * 60_000;
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

class InvalidOutputError extends Error {}
class StaleMemoryError extends Error {}

const providerConfiguration = (
  configuration: NonNullable<ReturnType<typeof readAiConfiguration>>,
): ProviderConfiguration | null =>
  configuration.model
    ? {
        baseUrl: configuration.baseUrl,
        apiKey: configuration.apiKey,
        model: configuration.model,
      }
    : null;

const errorStatus = (error: unknown): number | null => {
  if (error instanceof ProviderResponseError) return error.status;
  if (typeof error !== 'object' || error === null) return null;
  const value = 'statusCode' in error ? error.statusCode : null;
  return typeof value === 'number' ? value : null;
};

const invalidConfigurationError = (error: unknown): boolean => {
  const status = errorStatus(error);
  return status === 400 || status === 401 || status === 403 || status === 404;
};

const invokeReflection = async (
  invoker: AiInvoker,
  configuration: ProviderConfiguration,
  input: ReflectionInput,
): Promise<ReflectionOutput> => {
  try {
    return await invoker.reflect(configuration, input);
  } catch (error) {
    if (!NoObjectGeneratedError.isInstance(error)) throw error;
  }

  try {
    return await invoker.reflect(configuration, {
      ...input,
      correction:
        'The previous response did not match the required schema. Return only a complete valid result.',
    });
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      throw new InvalidOutputError(
        'The model returned invalid structured output.',
      );
    }
    throw error;
  }
};

const memoryDocument = (
  existing: ReflectionMemoryDocument | null,
  markdown: string,
  updatedFromDocumentIds: string[],
  configuration: ProviderConfiguration,
  now: string,
): ReflectionMemoryDocument => {
  if (!existing) {
    return createReflectionMemoryDocument({
      id: reflectionMemoryId,
      payload: {
        revision: 1,
        markdown,
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
      markdown,
      updatedFromDocumentIds,
      generatedAt: now,
      model: configuration.model,
      analysisVersion,
    },
    updatedAt: now,
    updatedByDeviceId: serverDeviceId,
  };
};

const deterministicSuggestionId = (jobId: string, index: number): string =>
  `suggestion:${createHash('sha256').update(`${jobId}:${index}`).digest('hex').slice(0, 24)}`;

export const reflectionMemoryMarkdown = (markdown: string): string =>
  markdown.replace(/^\s*#\s+[^\n]+\n+/u, '').trim();

const completeAnalysis = (
  database: MindfullDatabase,
  job: typeof aiJobs.$inferSelect,
  output: ReflectionOutput,
  configuration: ProviderConfiguration,
  expectedMemory: ReflectionMemoryDocument | null,
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
    reflectionMemoryMarkdown(output.updatedMemoryMarkdown),
    [source.id],
    configuration,
    now,
  );
  const analysis = createAnalysisResultDocument({
    id: `analysis:${source.id}:${job.sourceContentHash}:v${analysisVersion}`,
    payload: {
      sourceDocumentId: source.id,
      sourceContentHash: job.sourceContentHash,
      summary: output.summary,
      themes: output.themes,
      unfinishedCommitments: output.unfinishedCommitments,
      generatedAt: now,
      provider: 'openai-compatible',
      model: configuration.model,
      analysisVersion,
    },
    now,
    occurredAt: source.occurredAt,
    parentId: source.id,
    deviceId: serverDeviceId,
  });
  const suggestions = output.taskSuggestions.map((proposedText, index) =>
    createTaskSuggestionDocument({
      id: deterministicSuggestionId(job.id, index),
      payload: {
        proposedText,
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

  database.transaction((transaction) => {
    const currentMemory = findDocument(transaction, reflectionMemoryId);
    const currentRevision =
      currentMemory?.type === 'reflection-memory'
        ? currentMemory.payload.revision
        : null;
    if (currentRevision !== (expectedMemory?.payload.revision ?? null)) {
      throw new StaleMemoryError('Reflection memory changed during inference.');
    }

    for (const document of [nextMemory, analysis, ...suggestions]) {
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
  const output = await invokeReflection(invoker, configuration, {
    memoryMarkdown: memory?.payload.markdown ?? '',
    sourceKind: source.type,
    sourceText: text,
  });
  completeAnalysis(database, job, output, configuration, memory, now);
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
    sourceKind: 'memory-batch',
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
          markdown: reflectionMemoryMarkdown(output.updatedMemoryMarkdown),
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
    reflectionMemoryMarkdown(output.updatedMemoryMarkdown),
    sourceDocumentIds.slice(-100),
    configuration,
    now,
  );
  database.transaction((transaction) => {
    if (findDocument(transaction, reflectionMemoryId)) {
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

export const startAiWorker = (
  database: MindfullDatabase,
  options: {
    invoker?: AiInvoker;
    modelLoader?: typeof loadProviderModels;
    onError?: (error: unknown) => void;
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
          invalidConfigurationError(error)
            ? 'invalid-configuration'
            : 'unreachable',
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
            Date.parse(now) + leaseDurationMs,
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
            'invocation-failed',
            invalidConfigurationError(error),
          );
        }
        if (terminal) {
          providerFailure(database, 0, now, 'structured-output', true);
        }
        options.onError?.(error);
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
