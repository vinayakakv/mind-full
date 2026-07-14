import { atom } from 'jotai';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'unpaired' | 'error';

export const syncStatusAtom = atom<SyncStatus>('idle');
