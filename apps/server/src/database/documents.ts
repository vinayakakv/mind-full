import {
  canReplaceDocument,
  compareDocumentVersions,
  type DomainDocument,
  parseDomainDocument,
} from '@mindfull/domain';
import { asc, eq, gt } from 'drizzle-orm';

import type { MindfullDatabase } from './database.js';
import { changes, documents } from './schema.js';

type DocumentRow = typeof documents.$inferSelect;
type DatabaseTransaction = Parameters<
  Parameters<MindfullDatabase['transaction']>[0]
>[0];
type DocumentDatabase = Pick<DatabaseTransaction, 'insert' | 'select'>;

export const documentFromRow = (row: DocumentRow): DomainDocument =>
  parseDomainDocument({
    id: row.id,
    type: row.type,
    schemaVersion: row.schemaVersion,
    payload: JSON.parse(row.payload),
    occurredAt: row.occurredAt,
    parentId: row.parentId,
    sortKey: row.sortKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    updatedByDeviceId: row.updatedByDeviceId,
    deletedAt: row.deletedAt,
  });

const rowFromDocument = (document: DomainDocument) => ({
  id: document.id,
  type: document.type,
  schemaVersion: document.schemaVersion,
  payload: JSON.stringify(document.payload),
  occurredAt: document.occurredAt,
  parentId: document.parentId,
  sortKey: document.sortKey,
  createdAt: document.createdAt,
  updatedAt: document.updatedAt,
  updatedByDeviceId: document.updatedByDeviceId,
  deletedAt: document.deletedAt,
});

export const findDocument = (
  database: DocumentDatabase,
  documentId: string,
): DomainDocument | undefined => {
  const row = database
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .get();

  return row ? documentFromRow(row) : undefined;
};

export const storeDocument = (
  database: DocumentDatabase,
  document: DomainDocument,
): void => {
  const row = rowFromDocument(document);

  database
    .insert(documents)
    .values(row)
    .onConflictDoUpdate({
      target: documents.id,
      set: row,
    })
    .run();

  database
    .insert(changes)
    .values({ documentId: document.id, changedAt: new Date().toISOString() })
    .run();
};

const acceptDocument = (
  database: DocumentDatabase,
  incomingDocument: DomainDocument,
): DomainDocument => {
  const storedDocument = findDocument(database, incomingDocument.id);

  if (!storedDocument) {
    storeDocument(database, incomingDocument);
    return incomingDocument;
  }

  if (storedDocument.type !== incomingDocument.type) {
    throw new Error('A document cannot change its type.');
  }

  if (compareDocumentVersions(incomingDocument, storedDocument) > 0) {
    if (!canReplaceDocument(storedDocument, incomingDocument)) {
      throw new Error('A completed log cannot be changed.');
    }

    storeDocument(database, incomingDocument);
    return incomingDocument;
  }

  return storedDocument;
};

export type SyncResult = {
  cursor: number;
  documents: DomainDocument[];
};

export const synchronizeDocuments = (
  database: MindfullDatabase,
  cursor: number,
  incomingDocuments: DomainDocument[],
): SyncResult => {
  const resolvedDocuments = database.transaction((transaction) =>
    incomingDocuments.map((document) => acceptDocument(transaction, document)),
  );

  const changeRows = database
    .select()
    .from(changes)
    .where(gt(changes.sequence, cursor))
    .orderBy(asc(changes.sequence))
    .limit(500)
    .all();

  const changedDocuments = changeRows.flatMap(({ documentId }) => {
    const document = findDocument(database, documentId);
    return document ? [document] : [];
  });

  const uniqueDocuments = new Map<string, DomainDocument>();

  for (const document of [...resolvedDocuments, ...changedDocuments]) {
    uniqueDocuments.set(document.id, document);
  }

  return {
    cursor: changeRows.at(-1)?.sequence ?? cursor,
    documents: [...uniqueDocuments.values()],
  };
};
