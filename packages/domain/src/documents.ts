import { ulid } from 'ulid';
import { z } from 'zod';

const instantSchema = z.string().datetime({ offset: true });
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timezoneSchema = z.string().min(1);

const sourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('manual') }),
  z.object({
    kind: z.literal('journal'),
    documentId: z.string().min(1),
  }),
  z.object({
    kind: z.literal('check-in'),
    documentId: z.string().min(1),
  }),
]);

export const settingsPayloadSchema = z.object({
  timezone: timezoneSchema,
  theme: z.enum(['light', 'dark', 'system']),
  ambience: z.enum(['gentle', 'still', 'off']).default('gentle'),
  morningStartsAt: z.string().regex(/^\d{2}:\d{2}$/),
  eveningStartsAt: z.string().regex(/^\d{2}:\d{2}$/),
  weeklyReviewDay: z.number().int().min(0).max(6),
  weeklyReviewTime: z.string().regex(/^\d{2}:\d{2}$/),
  completedTaskRetentionDays: z.number().int().positive(),
});

export const taskPayloadSchema = z.object({
  text: z.string().trim().min(1).max(500),
  completedAt: instantSchema.nullable(),
  availableFrom: instantSchema.nullable(),
  reminderAt: instantSchema.nullable(),
  source: sourceSchema,
});

export const taskSuggestionPayloadSchema = z
  .object({
    proposedText: z.string().trim().min(1).max(500),
    reason: z.string().trim().min(1).max(500).nullable().optional(),
    availableFrom: instantSchema.nullable(),
    sourceDocumentId: z.string().min(1),
    sourceContentHash: z.string().min(1),
    state: z.enum(['pending', 'accepted', 'rejected', 'superseded']),
    acceptedTaskId: z.string().min(1).nullable(),
  })
  .refine(
    ({ state, acceptedTaskId }) =>
      (state === 'accepted') === (acceptedTaskId !== null),
    {
      message: 'Only an accepted suggestion can name its task.',
      path: ['acceptedTaskId'],
    },
  );

export const habitSuggestionPayloadSchema = z
  .object({
    proposedName: z.string().trim().min(1).max(100),
    reason: z.string().trim().min(1).max(500).nullable(),
    sourceDocumentId: z.string().min(1),
    sourceContentHash: z.string().min(1),
    state: z.enum(['pending', 'accepted', 'rejected', 'superseded']),
    acceptedHabitId: z.string().min(1).nullable(),
  })
  .refine(
    ({ state, acceptedHabitId }) =>
      (state === 'accepted') === (acceptedHabitId !== null),
    {
      message: 'Only an accepted suggestion can name its habit.',
      path: ['acceptedHabitId'],
    },
  );

const bodyMetricKindSchema = z.enum(['mass', 'circumference']);
const bodyUnitSchema = z.enum(['kg', 'lb', 'cm', 'in']);

export const bodyMetricPayloadSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    kind: bodyMetricKindSchema,
    preferredUnit: bodyUnitSchema,
    archivedAt: instantSchema.nullable(),
  })
  .refine(
    ({ kind, preferredUnit }) =>
      kind === 'mass'
        ? preferredUnit === 'kg' || preferredUnit === 'lb'
        : preferredUnit === 'cm' || preferredUnit === 'in',
    {
      message: 'The preferred unit must match the metric kind.',
      path: ['preferredUnit'],
    },
  );

export const bodyMeasurementPayloadSchema = z.object({
  metricId: z.string().min(1),
  value: z.number().positive(),
});

export const journalPayloadSchema = z.object({
  title: z.string().trim().min(1).max(200).nullable(),
  markdown: z.string(),
  localDate: localDateSchema,
  timezone: timezoneSchema,
  status: z.enum(['draft', 'completed']).default('completed'),
  completedAt: instantSchema.nullable().default(null),
});

const weekdaysSchema = z
  .array(z.number().int().min(0).max(6))
  .min(1)
  .max(7)
  .refine((weekdays) => new Set(weekdays).size === weekdays.length);

export const habitPayloadSchema = z.object({
  name: z.string().trim().min(1).max(100),
  weekdays: weekdaysSchema,
  schedules: z
    .array(
      z.object({
        effectiveFrom: localDateSchema,
        weekdays: weekdaysSchema,
      }),
    )
    .refine(
      (schedules) =>
        new Set(schedules.map(({ effectiveFrom }) => effectiveFrom)).size ===
        schedules.length,
      'A habit can have only one schedule per effective date.',
    )
    .default([]),
  reminderTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  archivedAt: instantSchema.nullable(),
});

export const habitLogPayloadSchema = z.object({
  habitId: z.string().min(1),
  localDate: localDateSchema,
  timezone: timezoneSchema,
  outcome: z.enum(['completed', 'missed']),
  reason: z.string().trim().min(1).max(500).nullable(),
});

export const reminderPayloadSchema = z
  .object({
    targetType: z.enum(['habit', 'task', 'check-in']),
    targetId: z.string().min(1),
    scheduledAt: instantSchema.nullable(),
    localTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable(),
    weekdays: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .refine((weekdays) => new Set(weekdays).size === weekdays.length)
      .nullable(),
    enabled: z.boolean(),
  })
  .superRefine((payload, context) => {
    const hasOneTimeSchedule = payload.scheduledAt !== null;
    const hasRecurringSchedule =
      payload.localTime !== null && payload.weekdays !== null;

    if (hasOneTimeSchedule === hasRecurringSchedule) {
      context.addIssue({
        code: 'custom',
        message: 'A reminder needs one one-time or recurring schedule.',
      });
    }
  });

export const checkInResponseSchema = z.object({
  promptId: z.string().min(1),
  promptText: z.string().min(1),
  source: z.enum(['curated', 'ai']),
  answer: z.string().nullable(),
  skipped: z.boolean(),
});

export const checkInPayloadSchema = z.object({
  kind: z.enum(['morning', 'evening']),
  localDate: localDateSchema,
  timezone: timezoneSchema,
  status: z.enum(['draft', 'completed']),
  currentStep: z.number().int().nonnegative(),
  mood: z.string().nullable(),
  energy: z.string().nullable(),
  stress: z.string().nullable(),
  emotions: z.array(z.string().min(1)),
  responses: z.array(checkInResponseSchema),
  reflectionMarkdown: z.string().nullable(),
  completedAt: instantSchema.nullable(),
});

const boundedReflectionItems = (maximum: number) =>
  z.array(z.string().trim().min(1).max(500)).max(maximum);

export const reflectionMemorySectionsSchema = z.object({
  context: boundedReflectionItems(8),
  supportivePatterns: boundedReflectionItems(8),
  recurringThemes: boundedReflectionItems(8),
  ongoingCommitments: boundedReflectionItems(8),
  openQuestions: boundedReflectionItems(8),
  uncertainImpressions: boundedReflectionItems(8),
});

export const weeklyReflectionSectionsSchema = z.object({
  summary: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe('A concise weekly summary in a short paragraph.'),
  brightSpots: boundedReflectionItems(3),
  difficultParts: boundedReflectionItems(3),
  supportiveActions: boundedReflectionItems(3),
  questionsToCarry: boundedReflectionItems(3),
});

export const reflectionMemoryPayloadSchema = z.object({
  revision: z.number().int().positive(),
  markdown: z.string().trim().min(1).max(20_000),
  sections: reflectionMemorySectionsSchema.optional(),
  updatedFromDocumentIds: z.array(z.string().min(1)).max(100),
  generatedAt: instantSchema,
  provider: z.string().min(1).max(100),
  model: z.string().min(1).max(200),
  analysisVersion: z.number().int().positive(),
});

export const weeklyReflectionPayloadSchema = z.object({
  revision: z.number().int().positive(),
  weekStart: localDateSchema,
  weekEnd: localDateSchema,
  sections: weeklyReflectionSectionsSchema,
  updatedFromDocumentIds: z.array(z.string().min(1)).max(100),
  generatedAt: instantSchema,
  provider: z.string().min(1).max(100),
  model: z.string().min(1).max(200),
  analysisVersion: z.number().int().positive(),
});

export const analysisResultPayloadSchema = z.object({
  sourceDocumentId: z.string().min(1),
  sourceContentHash: z.string().min(1),
  summary: z.string().trim().min(1).max(2_000),
  themes: z.array(z.string().trim().min(1).max(120)).max(8),
  unfinishedCommitments: z.array(z.string().trim().min(1).max(500)).max(8),
  generatedAt: instantSchema,
  provider: z.string().min(1).max(100),
  model: z.string().min(1).max(200),
  analysisVersion: z.number().int().positive(),
});

const envelopeFields = {
  id: z.string().min(1),
  schemaVersion: z.literal(1),
  occurredAt: instantSchema.nullable(),
  parentId: z.string().min(1).nullable(),
  sortKey: z.string().min(1).nullable(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  updatedByDeviceId: z.string().min(1),
  deletedAt: instantSchema.nullable(),
};

export const settingsDocumentSchema = z.object({
  ...envelopeFields,
  type: z.literal('settings'),
  payload: settingsPayloadSchema,
});

export const taskDocumentSchema = z.object({
  ...envelopeFields,
  type: z.literal('task'),
  payload: taskPayloadSchema,
});

export const taskSuggestionDocumentSchema = z.object({
  ...envelopeFields,
  type: z.literal('task-suggestion'),
  payload: taskSuggestionPayloadSchema,
});

export const habitSuggestionDocumentSchema = z.object({
  ...envelopeFields,
  type: z.literal('habit-suggestion'),
  payload: habitSuggestionPayloadSchema,
});

export const bodyMetricDocumentSchema = z.object({
  ...envelopeFields,
  type: z.literal('body-metric'),
  payload: bodyMetricPayloadSchema,
});

export const bodyMeasurementDocumentSchema = z.object({
  ...envelopeFields,
  type: z.literal('body-measurement'),
  payload: bodyMeasurementPayloadSchema,
});

export const journalDocumentSchema = z.object({
  ...envelopeFields,
  type: z.literal('journal'),
  payload: journalPayloadSchema,
});

export const habitDocumentSchema = z.object({
  ...envelopeFields,
  type: z.literal('habit'),
  payload: habitPayloadSchema,
});

export const habitLogDocumentSchema = z.object({
  ...envelopeFields,
  type: z.literal('habit-log'),
  payload: habitLogPayloadSchema,
});

export const reminderDocumentSchema = z.object({
  ...envelopeFields,
  type: z.literal('reminder'),
  payload: reminderPayloadSchema,
});

export const checkInDocumentSchema = z.object({
  ...envelopeFields,
  type: z.literal('check-in'),
  payload: checkInPayloadSchema,
});

export const reflectionMemoryDocumentSchema = z.object({
  ...envelopeFields,
  type: z.literal('reflection-memory'),
  payload: reflectionMemoryPayloadSchema,
});

export const weeklyReflectionDocumentSchema = z.object({
  ...envelopeFields,
  type: z.literal('weekly-reflection'),
  payload: weeklyReflectionPayloadSchema,
});

export const analysisResultDocumentSchema = z.object({
  ...envelopeFields,
  type: z.literal('analysis-result'),
  payload: analysisResultPayloadSchema,
});

export const domainDocumentSchema = z.discriminatedUnion('type', [
  settingsDocumentSchema,
  taskDocumentSchema,
  taskSuggestionDocumentSchema,
  habitSuggestionDocumentSchema,
  bodyMetricDocumentSchema,
  bodyMeasurementDocumentSchema,
  journalDocumentSchema,
  habitDocumentSchema,
  habitLogDocumentSchema,
  reminderDocumentSchema,
  checkInDocumentSchema,
  reflectionMemoryDocumentSchema,
  weeklyReflectionDocumentSchema,
  analysisResultDocumentSchema,
]);

export type SettingsPayload = z.infer<typeof settingsPayloadSchema>;
export type TaskPayload = z.infer<typeof taskPayloadSchema>;
export type TaskSuggestionPayload = z.infer<typeof taskSuggestionPayloadSchema>;
export type HabitSuggestionPayload = z.infer<
  typeof habitSuggestionPayloadSchema
>;
export type BodyMetricPayload = z.infer<typeof bodyMetricPayloadSchema>;
export type BodyMeasurementPayload = z.infer<
  typeof bodyMeasurementPayloadSchema
>;
export type JournalPayload = z.infer<typeof journalPayloadSchema>;
export type HabitPayload = z.infer<typeof habitPayloadSchema>;
export type HabitLogPayload = z.infer<typeof habitLogPayloadSchema>;
export type ReminderPayload = z.infer<typeof reminderPayloadSchema>;
export type CheckInPayload = z.infer<typeof checkInPayloadSchema>;
export type ReflectionMemoryPayload = z.infer<
  typeof reflectionMemoryPayloadSchema
>;
export type ReflectionMemorySections = z.infer<
  typeof reflectionMemorySectionsSchema
>;
export type WeeklyReflectionPayload = z.infer<
  typeof weeklyReflectionPayloadSchema
>;
export type WeeklyReflectionSections = z.infer<
  typeof weeklyReflectionSectionsSchema
>;
export type AnalysisResultPayload = z.infer<typeof analysisResultPayloadSchema>;
export type SettingsDocument = z.infer<typeof settingsDocumentSchema>;
export type TaskDocument = z.infer<typeof taskDocumentSchema>;
export type TaskSuggestionDocument = z.infer<
  typeof taskSuggestionDocumentSchema
>;
export type HabitSuggestionDocument = z.infer<
  typeof habitSuggestionDocumentSchema
>;
export type BodyMetricDocument = z.infer<typeof bodyMetricDocumentSchema>;
export type BodyMeasurementDocument = z.infer<
  typeof bodyMeasurementDocumentSchema
>;
export type JournalDocument = z.infer<typeof journalDocumentSchema>;
export type HabitDocument = z.infer<typeof habitDocumentSchema>;
export type HabitLogDocument = z.infer<typeof habitLogDocumentSchema>;
export type ReminderDocument = z.infer<typeof reminderDocumentSchema>;
export type CheckInDocument = z.infer<typeof checkInDocumentSchema>;
export type ReflectionMemoryDocument = z.infer<
  typeof reflectionMemoryDocumentSchema
>;
export type WeeklyReflectionDocument = z.infer<
  typeof weeklyReflectionDocumentSchema
>;
export type AnalysisResultDocument = z.infer<
  typeof analysisResultDocumentSchema
>;
export type DomainDocument = z.infer<typeof domainDocumentSchema>;
export type DocumentType = DomainDocument['type'];

export type NewDocument<TPayload> = {
  id: string;
  payload: TPayload;
  now: string;
  deviceId: string;
  occurredAt?: string | null;
  parentId?: string | null;
  sortKey?: string | null;
};

const createEnvelope = <TPayload>({
  id,
  payload,
  now,
  deviceId,
  occurredAt = now,
  parentId = null,
  sortKey = null,
}: NewDocument<TPayload>) => ({
  id,
  schemaVersion: 1 as const,
  payload,
  occurredAt,
  parentId,
  sortKey,
  createdAt: now,
  updatedAt: now,
  updatedByDeviceId: deviceId,
  deletedAt: null,
});

export const createDocumentId = (): string => ulid();

export const createSettingsDocument = (
  input: NewDocument<SettingsPayload>,
): SettingsDocument =>
  settingsDocumentSchema.parse({
    ...createEnvelope({ ...input, occurredAt: null }),
    type: 'settings',
  });

export const createTaskDocument = (
  input: NewDocument<TaskPayload>,
): TaskDocument =>
  taskDocumentSchema.parse({
    ...createEnvelope(input),
    type: 'task',
  });

export const createTaskSuggestionDocument = (
  input: NewDocument<TaskSuggestionPayload>,
): TaskSuggestionDocument =>
  taskSuggestionDocumentSchema.parse({
    ...createEnvelope(input),
    type: 'task-suggestion',
  });

export const createHabitSuggestionDocument = (
  input: NewDocument<HabitSuggestionPayload>,
): HabitSuggestionDocument =>
  habitSuggestionDocumentSchema.parse({
    ...createEnvelope(input),
    type: 'habit-suggestion',
  });

export const createBodyMetricDocument = (
  input: NewDocument<BodyMetricPayload>,
): BodyMetricDocument =>
  bodyMetricDocumentSchema.parse({
    ...createEnvelope({ ...input, occurredAt: null }),
    type: 'body-metric',
  });

export const createBodyMeasurementDocument = (
  input: NewDocument<BodyMeasurementPayload>,
): BodyMeasurementDocument =>
  bodyMeasurementDocumentSchema.parse({
    ...createEnvelope(input),
    type: 'body-measurement',
  });

export const createJournalDocument = (
  input: NewDocument<JournalPayload>,
): JournalDocument =>
  journalDocumentSchema.parse({
    ...createEnvelope(input),
    type: 'journal',
  });

export const createHabitDocument = (
  input: NewDocument<HabitPayload>,
): HabitDocument =>
  habitDocumentSchema.parse({
    ...createEnvelope(input),
    type: 'habit',
  });

export const createHabitLogDocument = (
  input: NewDocument<HabitLogPayload>,
): HabitLogDocument =>
  habitLogDocumentSchema.parse({
    ...createEnvelope(input),
    type: 'habit-log',
  });

export const createReminderDocument = (
  input: NewDocument<ReminderPayload>,
): ReminderDocument =>
  reminderDocumentSchema.parse({
    ...createEnvelope(input),
    type: 'reminder',
  });

export const createCheckInDocument = (
  input: NewDocument<CheckInPayload>,
): CheckInDocument =>
  checkInDocumentSchema.parse({
    ...createEnvelope(input),
    type: 'check-in',
  });

export const createReflectionMemoryDocument = (
  input: NewDocument<ReflectionMemoryPayload>,
): ReflectionMemoryDocument =>
  reflectionMemoryDocumentSchema.parse({
    ...createEnvelope({ ...input, occurredAt: null }),
    type: 'reflection-memory',
  });

export const createWeeklyReflectionDocument = (
  input: NewDocument<WeeklyReflectionPayload>,
): WeeklyReflectionDocument =>
  weeklyReflectionDocumentSchema.parse({
    ...createEnvelope({ ...input, occurredAt: null }),
    type: 'weekly-reflection',
  });

export const createAnalysisResultDocument = (
  input: NewDocument<AnalysisResultPayload>,
): AnalysisResultDocument =>
  analysisResultDocumentSchema.parse({
    ...createEnvelope(input),
    type: 'analysis-result',
  });

export const parseDomainDocument = (input: unknown): DomainDocument =>
  domainDocumentSchema.parse(input);

export const migrateDomainDocument = (input: unknown): DomainDocument =>
  parseDomainDocument(input);

export const compareDocumentVersions = (
  left: Pick<DomainDocument, 'updatedAt' | 'updatedByDeviceId'>,
  right: Pick<DomainDocument, 'updatedAt' | 'updatedByDeviceId'>,
): number => {
  const timestampOrder = left.updatedAt.localeCompare(right.updatedAt);

  if (timestampOrder !== 0) {
    return timestampOrder;
  }

  return left.updatedByDeviceId.localeCompare(right.updatedByDeviceId);
};

export const nextDocumentTimestamp = (
  previousTimestamp: string,
  proposedTimestamp: string,
): string => {
  if (proposedTimestamp > previousTimestamp) {
    return proposedTimestamp;
  }

  return new Date(Date.parse(previousTimestamp) + 1).toISOString();
};

export const selectWinningDocument = <TDocument extends DomainDocument>(
  left: TDocument,
  right: TDocument,
): TDocument => {
  if (left.id !== right.id) {
    throw new Error('Cannot resolve versions of different documents.');
  }

  return compareDocumentVersions(left, right) >= 0 ? left : right;
};

const isCompletedLog = (document: DomainDocument): boolean =>
  (document.type === 'journal' && document.payload.status === 'completed') ||
  (document.type === 'check-in' && document.payload.status === 'completed');

const immutableLogContent = (document: DomainDocument): string =>
  JSON.stringify({
    type: document.type,
    schemaVersion: document.schemaVersion,
    payload: document.payload,
    occurredAt: document.occurredAt,
    parentId: document.parentId,
    sortKey: document.sortKey,
    createdAt: document.createdAt,
  });

export const canReplaceDocument = (
  stored: DomainDocument,
  incoming: DomainDocument,
): boolean =>
  !isCompletedLog(stored) ||
  (immutableLogContent(stored) === immutableLogContent(incoming) &&
    (stored.deletedAt === incoming.deletedAt ||
      (stored.deletedAt === null && incoming.deletedAt !== null)));
