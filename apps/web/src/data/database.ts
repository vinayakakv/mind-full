import type { DomainDocument } from '@mindfull/domain';
import Dexie, { type EntityTable } from 'dexie';

export type LocalSyncState = {
  documentId: string;
  dirty: 0 | 1;
  lastSyncedAt: string | null;
  lastServerVersion: number | null;
};

export type LocalSyncMeta = {
  key: string;
  value: string;
};

class MindfullDatabase extends Dexie {
  documents!: EntityTable<DomainDocument, 'id'>;
  syncState!: EntityTable<LocalSyncState, 'documentId'>;
  syncMeta!: EntityTable<LocalSyncMeta, 'key'>;

  constructor() {
    super('mindfull');

    this.version(1).stores({
      documents:
        'id, type, occurredAt, parentId, sortKey, updatedAt, deletedAt, [type+deletedAt]',
      syncState: 'documentId, dirty',
    });

    this.version(2).stores({
      documents:
        'id, type, occurredAt, parentId, sortKey, updatedAt, deletedAt, [type+deletedAt]',
      syncState: 'documentId',
      syncMeta: 'key',
    });
  }
}

export const database = new MindfullDatabase();
