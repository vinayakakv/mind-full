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
