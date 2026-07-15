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

export type LocalNotificationState = {
  reminderId: string;
  reminderUpdatedAt: string;
  nextScheduledAt: string | null;
  activeOccurrenceAt: string | null;
  activeStatus: 'due' | 'notified' | null;
};

class MindfullDatabase extends Dexie {
  documents!: EntityTable<DomainDocument, 'id'>;
  syncState!: EntityTable<LocalSyncState, 'documentId'>;
  syncMeta!: EntityTable<LocalSyncMeta, 'key'>;
  notificationState!: EntityTable<LocalNotificationState, 'reminderId'>;

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

    this.version(3).stores({
      documents:
        'id, type, occurredAt, parentId, sortKey, updatedAt, deletedAt, [type+deletedAt]',
      syncState: 'documentId',
      syncMeta: 'key',
      notificationState: 'reminderId, nextScheduledAt, activeStatus',
    });
  }
}

export const database = new MindfullDatabase();
