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

export const journalPayloadSchema = z.object({
  title: z.string().trim().min(1).max(200).nullable(),
  markdown: z.string(),
  localDate: localDateSchema,
  timezone: timezoneSchema,
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

export const journalDocumentSchema = z.object({
  ...envelopeFields,
  type: z.literal('journal'),
  payload: journalPayloadSchema,
});

export const checkInDocumentSchema = z.object({
  ...envelopeFields,
  type: z.literal('check-in'),
  payload: checkInPayloadSchema,
});

export const domainDocumentSchema = z.discriminatedUnion('type', [
  settingsDocumentSchema,
  taskDocumentSchema,
  journalDocumentSchema,
  checkInDocumentSchema,
]);

export type SettingsPayload = z.infer<typeof settingsPayloadSchema>;
export type TaskPayload = z.infer<typeof taskPayloadSchema>;
export type JournalPayload = z.infer<typeof journalPayloadSchema>;
export type CheckInPayload = z.infer<typeof checkInPayloadSchema>;
export type SettingsDocument = z.infer<typeof settingsDocumentSchema>;
export type TaskDocument = z.infer<typeof taskDocumentSchema>;
export type JournalDocument = z.infer<typeof journalDocumentSchema>;
export type CheckInDocument = z.infer<typeof checkInDocumentSchema>;
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

export const createJournalDocument = (
  input: NewDocument<JournalPayload>,
): JournalDocument =>
  journalDocumentSchema.parse({
    ...createEnvelope(input),
    type: 'journal',
  });

export const createCheckInDocument = (
  input: NewDocument<CheckInPayload>,
): CheckInDocument =>
  checkInDocumentSchema.parse({
    ...createEnvelope(input),
    type: 'check-in',
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
