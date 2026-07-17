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

export type NativeNotificationState = {
  key: string;
  notificationId: number;
  reminderId: string;
  reminderUpdatedAt: string;
  projectionVersion: number;
};

class MindfullDatabase extends Dexie {
  documents!: EntityTable<DomainDocument, 'id'>;
  syncState!: EntityTable<LocalSyncState, 'documentId'>;
  syncMeta!: EntityTable<LocalSyncMeta, 'key'>;
  notificationState!: EntityTable<LocalNotificationState, 'reminderId'>;
  nativeNotificationState!: EntityTable<NativeNotificationState, 'key'>;

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

    this.version(4).stores({
      documents:
        'id, type, occurredAt, parentId, sortKey, updatedAt, deletedAt, [type+deletedAt]',
      syncState: 'documentId',
      syncMeta: 'key',
      notificationState: 'reminderId, nextScheduledAt, activeStatus',
      nativeNotificationState: 'key, notificationId, reminderId',
    });
  }
}

export const database = new MindfullDatabase();
