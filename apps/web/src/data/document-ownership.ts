import { type DomainDocument, nextDocumentTimestamp } from '@mindfull/domain';

import { database } from './database';

export const claimLocalDocument = <TDocument extends DomainDocument>(
  document: TDocument,
  deviceId: string,
  now = new Date().toISOString(),
): TDocument => {
  if (document.updatedByDeviceId === deviceId) return document;

  return {
    ...document,
    updatedAt: nextDocumentTimestamp(document.updatedAt, now),
    updatedByDeviceId: deviceId,
  };
};

export const dirtyDocumentsForSync = async (
  deviceId: string,
  now = new Date().toISOString(),
): Promise<DomainDocument[]> =>
  database.transaction(
    'rw',
    database.documents,
    database.syncState,
    async () => {
      const dirtyStates = await database.syncState
        .filter(({ dirty }) => dirty === 1)
        .toArray();
      const documents = (
        await database.documents.bulkGet(
          dirtyStates.map(({ documentId }) => documentId),
        )
      ).filter((document) => document !== undefined);
      const claimedDocuments = documents.map((document) =>
        claimLocalDocument(document, deviceId, now),
      );
      const repairedDocuments = claimedDocuments.filter(
        (document, index) => document !== documents[index],
      );

      if (repairedDocuments.length) {
        await database.documents.bulkPut(repairedDocuments);
      }

      return claimedDocuments;
    },
  );
