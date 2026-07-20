import { createHash, randomUUID } from 'node:crypto';
import {
  createHabitSuggestionDocument,
  createReflectionMemoryDocument,
  createTaskSuggestionDocument,
  createWeeklyReflectionDocument,
  type ReflectionMemoryDocument,
  type ReflectionMemorySections,
  reflectionMemorySectionsSchema,
  type WeeklyReflectionDocument,
  type WeeklyReflectionSections,
  weeklyReflectionSectionsSchema,
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
  type SuggestionDuplicateInput,
  suggestionDuplicateTimeoutMs,
  type WeeklyRebuildInput,
  type WeeklyRebuildOutput,
} from './provider.js';
import {
  analysisVersion,
  currentWeekReflectionId,
  currentWeekSources,
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
  reflectionSuggestionCatalog,
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
  responseTimeoutMinutes * 60_000 +
  suggestionDuplicateTimeoutMs +
  leaseMarginMs;

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
        'The previous response did not match the required schema. Return only a complete valid result. Include at least one grounded weekly detail across brightSpots, difficultParts, supportiveActions, or questionsToCarry; leave a particular section empty only when the records do not support it.',
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

const invokeWeeklyRebuild = async (
  invoker: AiInvoker,
  configuration: ProviderConfiguration,
  input: WeeklyRebuildInput,
): Promise<WeeklyRebuildOutput> => {
  let firstFailure: AiOutputAttemptDiagnostic;
  try {
    return await invoker.rebuildWeek(configuration, input);
  } catch (error) {
    if (!NoObjectGeneratedError.isInstance(error)) throw error;
    firstFailure = outputAttemptDiagnostic(error, 1);
  }

  try {
    return await invoker.rebuildWeek(configuration, {
      ...input,
      correction:
        'The previous response did not match the required schema. Return only a complete valid result. Include at least one grounded weekly detail across brightSpots, difficultParts, supportiveActions, or questionsToCarry; leave a particular section empty only when the records do not support it.',
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

export const checkSuggestionNovelty = async (
  invoker: AiInvoker,
  configuration: ProviderConfiguration,
  output: ReflectionOutput,
  catalog: Omit<SuggestionDuplicateInput, 'taskCandidates' | 'habitCandidates'>,
  onFailure: () => void = () => {},
): Promise<ReflectionOutput> => {
  if (!output.taskSuggestions.length && !output.habitSuggestions.length) {
    return output;
  }

  try {
    const duplicates = await invoker.findSuggestionDuplicates(configuration, {
      ...catalog,
      taskCandidates: output.taskSuggestions.map(({ text }) => text),
      habitCandidates: output.habitSuggestions.map(({ text }) => text),
    });
    return {
      ...output,
      taskSuggestions: output.taskSuggestions.filter(
        (_, index) => !duplicates.taskDuplicates[index],
      ),
      habitSuggestions: output.habitSuggestions.filter(
        (_, index) => !duplicates.habitDuplicates[index],
      ),
    };
  } catch {
    onFailure();
    return { ...output, taskSuggestions: [], habitSuggestions: [] };
  }
};

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
  onSuggestionCheckFailure: (counts: {
    taskCandidates: number;
    habitCandidates: number;
  }) => void,
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
  const reflectionOutput = await invokeReflection(invoker, configuration, {
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
    sourceText: text,
  });
  const output = await checkSuggestionNovelty(
    invoker,
    configuration,
    reflectionOutput,
    reflectionSuggestionCatalog(database),
    () =>
      onSuggestionCheckFailure({
        taskCandidates: reflectionOutput.taskSuggestions.length,
        habitCandidates: reflectionOutput.habitSuggestions.length,
      }),
  );
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

export const chronologicalSourceText = (
  sources: ReturnType<typeof historicalSources>,
): string =>
  sources
    .map((source) =>
      [
        source.type === 'journal'
          ? '[journal]'
          : `[${source.payload.kind} check-in]`,
        sourceText(source),
      ].join('\n'),
    )
    .join('\n\n---\n\n');

const rebuiltWeekDocument = (
  sections: WeeklyReflectionSections,
  sourceDocumentIds: string[],
  weekStart: string,
  weekEnd: string,
  configuration: ProviderConfiguration,
  now: string,
): WeeklyReflectionDocument =>
  createWeeklyReflectionDocument({
    id: currentWeekReflectionId,
    payload: {
      revision: 1,
      weekStart,
      weekEnd,
      sections,
      updatedFromDocumentIds: sourceDocumentIds.slice(-100),
      generatedAt: now,
      provider: 'openai-compatible',
      model: configuration.model,
      analysisVersion,
    },
    now,
    deviceId: serverDeviceId,
  });

const publishReflectionRebuild = (
  database: MindfullDatabase,
  job: typeof aiJobs.$inferSelect,
  memorySections: ReflectionMemorySections,
  memorySourceDocumentIds: string[],
  week: {
    sections: WeeklyReflectionSections;
    sourceDocumentIds: string[];
    weekStart: string;
    weekEnd: string;
  } | null,
  configuration: ProviderConfiguration,
  now: string,
): void => {
  const memory = memoryDocument(
    null,
    memorySections,
    memorySourceDocumentIds.slice(-100),
    configuration,
    now,
  );
  const weekDocument = week
    ? rebuiltWeekDocument(
        week.sections,
        week.sourceDocumentIds,
        week.weekStart,
        week.weekEnd,
        configuration,
        now,
      )
    : null;

  database.transaction((transaction) => {
    const currentMemory = findDocument(transaction, reflectionMemoryId);
    const currentWeek = findDocument(transaction, currentWeekReflectionId);
    if (
      (currentMemory && !currentMemory.deletedAt) ||
      (currentWeek && !currentWeek.deletedAt)
    ) {
      throw new StaleMemoryError(
        'Reflections changed while the rebuild was running.',
      );
    }
    storeDocument(transaction, memory);
    if (weekDocument) storeDocument(transaction, weekDocument);
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
        lastErrorCode: null,
      })
      .where(eq(aiJobs.id, job.id))
      .run();
  });
};

const processMemoryRebuild = async (
  database: MindfullDatabase,
  job: typeof aiJobs.$inferSelect,
  build: typeof aiMemoryBuilds.$inferSelect,
  configuration: ProviderConfiguration,
  invoker: AiInvoker,
  now: string,
): Promise<void> => {
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
    sourceText: chronologicalSourceText(batch),
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
          memorySections: JSON.stringify(output.updatedMemory),
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

  const weekSources = currentWeekSources(
    database,
    build.weekStart,
    build.weekEnd,
  );
  if (!weekSources.length || !build.weekStart || !build.weekEnd) {
    publishReflectionRebuild(
      database,
      job,
      output.updatedMemory,
      sourceDocumentIds,
      null,
      configuration,
      now,
    );
    return;
  }

  database.transaction((transaction) => {
    transaction
      .update(aiMemoryBuilds)
      .set({
        phase: 'week',
        markdown: reflectionMemoryMarkdownFor(output.updatedMemory),
        memorySections: JSON.stringify(output.updatedMemory),
        nextSourceIndex: nextIndex,
        sourceDocumentIds: JSON.stringify(sourceDocumentIds),
        updatedAt: now,
      })
      .where(eq(aiMemoryBuilds.jobId, job.id))
      .run();
    transaction
      .update(aiJobs)
      .set({
        state: 'waiting',
        leaseOwner: null,
        leaseExpiresAt: null,
      })
      .where(eq(aiJobs.id, job.id))
      .run();
  });
};

const processWeekRebuild = async (
  database: MindfullDatabase,
  job: typeof aiJobs.$inferSelect,
  build: typeof aiMemoryBuilds.$inferSelect,
  configuration: ProviderConfiguration,
  invoker: AiInvoker,
  now: string,
): Promise<void> => {
  if (!build.weekStart || !build.weekEnd || !build.memorySections) {
    throw new Error('The weekly reflection rebuild is incomplete.');
  }
  const memorySections = reflectionMemorySectionsSchema.parse(
    JSON.parse(build.memorySections),
  );
  const sources = currentWeekSources(database, build.weekStart, build.weekEnd);
  const batch = initialBatch(sources, build.weekSourceIndex);
  if (!batch.length) {
    publishReflectionRebuild(
      database,
      job,
      memorySections,
      JSON.parse(build.sourceDocumentIds) as string[],
      null,
      configuration,
      now,
    );
    return;
  }
  const currentSections = build.weekSections
    ? weeklyReflectionSectionsSchema.parse(JSON.parse(build.weekSections))
    : null;
  const output = await invokeWeeklyRebuild(invoker, configuration, {
    memoryMarkdown: build.markdown,
    currentWeek: currentSections
      ? {
          weekStart: build.weekStart,
          weekEnd: build.weekEnd,
          sections: currentSections,
        }
      : null,
    sourceText: chronologicalSourceText(batch),
  });
  const nextIndex = build.weekSourceIndex + batch.length;
  const sourceDocumentIds = [
    ...(JSON.parse(build.weekSourceDocumentIds) as string[]),
    ...batch.map(({ id }) => id),
  ];

  if (nextIndex < sources.length) {
    database.transaction((transaction) => {
      transaction
        .update(aiMemoryBuilds)
        .set({
          weekSections: JSON.stringify(output.updatedWeek),
          weekSourceIndex: nextIndex,
          weekSourceDocumentIds: JSON.stringify(sourceDocumentIds),
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

  publishReflectionRebuild(
    database,
    job,
    memorySections,
    JSON.parse(build.sourceDocumentIds) as string[],
    {
      sections: output.updatedWeek,
      sourceDocumentIds,
      weekStart: build.weekStart,
      weekEnd: build.weekEnd,
    },
    configuration,
    now,
  );
};

const processReflectionRebuild = async (
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
  if (!build) throw new Error('The reflection rebuild is unavailable.');
  if (build.phase === 'week') {
    await processWeekRebuild(database, job, build, configuration, invoker, now);
    return;
  }
  await processMemoryRebuild(database, job, build, configuration, invoker, now);
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

export type AiWorkerWarning = {
  jobId: string;
  warningCode: 'suggestion-check-failed';
  taskCandidates: number;
  habitCandidates: number;
};

export const startAiWorker = (
  database: MindfullDatabase,
  options: {
    invoker?: AiInvoker;
    modelLoader?: typeof loadProviderModels;
    onError?: (failure: AiWorkerFailure) => void;
    onWarning?: (warning: AiWorkerWarning) => void;
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
        if (
          job.kind === 'rebuild-reflections' ||
          job.kind === 'initialize-memory'
        ) {
          await processReflectionRebuild(
            database,
            job,
            configuration,
            invoker,
            now,
          );
        } else {
          await processAnalysis(
            database,
            job,
            configuration,
            invoker,
            now,
            ({ taskCandidates, habitCandidates }) =>
              options.onWarning?.({
                jobId: job.id,
                warningCode: 'suggestion-check-failed',
                taskCandidates,
                habitCandidates,
              }),
          );
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
