import { atom } from 'jotai';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'unpaired' | 'error';

export const syncStatusAtom = atom<SyncStatus>('idle');

export const syncStatusLabels: Record<SyncStatus, string> = {
  idle: 'Synced',
  syncing: 'Syncing',
  offline: 'Offline',
  unpaired: 'Local only',
  error: 'Sync waiting',
};

export const syncStatusDescriptions: Record<SyncStatus, string> = {
  idle: 'Everything is up to date.',
  syncing: 'Synchronizing now.',
  offline: 'Changes are safe here and will sync when this device is online.',
  unpaired: 'This device has not been paired yet.',
  error: 'Sync needs another try. Your local changes are safe.',
};
