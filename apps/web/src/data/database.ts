import type { DomainDocument } from '@mindfull/domain';
import Dexie, { type EntityTable } from 'dexie';

export type LocalSyncState = {
  documentId: string;
  dirty: boolean;
  lastSyncedAt: string | null;
  lastServerVersion: number | null;
};

class MindfullDatabase extends Dexie {
  documents!: EntityTable<DomainDocument, 'id'>;
  syncState!: EntityTable<LocalSyncState, 'documentId'>;

  constructor() {
    super('mindfull');

    this.version(1).stores({
      documents:
        'id, type, occurredAt, parentId, sortKey, updatedAt, deletedAt, [type+deletedAt]',
      syncState: 'documentId, dirty',
    });
  }
}

export const database = new MindfullDatabase();
