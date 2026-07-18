import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const documents = sqliteTable(
  'documents',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    payload: text('payload').notNull(),
    occurredAt: text('occurred_at'),
    parentId: text('parent_id'),
    sortKey: text('sort_key'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    updatedByDeviceId: text('updated_by_device_id').notNull(),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    index('documents_by_type_time').on(table.type, table.occurredAt),
    index('documents_by_parent_type').on(table.parentId, table.type),
    index('documents_by_updated_at').on(table.updatedAt),
  ],
);

export const changes = sqliteTable(
  'changes',
  {
    sequence: integer('sequence').primaryKey({ autoIncrement: true }),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id),
    changedAt: text('changed_at').notNull(),
  },
  (table) => [index('changes_by_document').on(table.documentId)],
);

export const devices = sqliteTable('devices', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: text('created_at').notNull(),
  revokedAt: text('revoked_at'),
});

export const backupRuns = sqliteTable('backup_runs', {
  scheduledFor: text('scheduled_for').primaryKey(),
  status: text('status').notNull(),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  path: text('path'),
  sizeBytes: integer('size_bytes'),
  error: text('error'),
  removedAt: text('removed_at'),
});

export const aiConfiguration = sqliteTable('ai_configuration', {
  id: text('id').primaryKey(),
  baseUrl: text('base_url').notNull(),
  apiKey: text('api_key').notNull(),
  model: text('model'),
  paused: integer('paused', { mode: 'boolean' }).notNull(),
  activatedAt: text('activated_at'),
  status: text('status').notNull(),
  lastCheckedAt: text('last_checked_at'),
  lastSucceededAt: text('last_succeeded_at'),
  nextCheckAt: text('next_check_at'),
  failureCount: integer('failure_count').notNull(),
  errorCode: text('error_code'),
  updatedAt: text('updated_at').notNull(),
});

export const aiJobs = sqliteTable(
  'ai_jobs',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    sourceDocumentId: text('source_document_id'),
    sourceContentHash: text('source_content_hash'),
    recordedAt: text('recorded_at').notNull(),
    state: text('state').notNull(),
    attemptCount: integer('attempt_count').notNull(),
    leaseOwner: text('lease_owner'),
    leaseExpiresAt: text('lease_expires_at'),
    lastErrorCode: text('last_error_code'),
    createdAt: text('created_at').notNull(),
    completedAt: text('completed_at'),
  },
  (table) => [index('ai_jobs_by_state_time').on(table.state, table.recordedAt)],
);

export const aiMemoryBuilds = sqliteTable('ai_memory_builds', {
  jobId: text('job_id')
    .primaryKey()
    .references(() => aiJobs.id),
  markdown: text('markdown').notNull(),
  nextSourceIndex: integer('next_source_index').notNull(),
  sourceDocumentIds: text('source_document_ids').notNull(),
  updatedAt: text('updated_at').notNull(),
});
