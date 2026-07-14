import { parseDomainDocument } from '@mindfull/domain';
import { getDefaultStore } from 'jotai';

import { syncStatusAtom } from '../state/sync';
import { database } from './database';
import { getDeviceId } from './device';
import { applyRemoteDocuments } from './documents';

const tokenKey = 'mindfull.sync-token';
const cursorKey = 'server-cursor';
const store = getDefaultStore();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const hasPairingToken = (): boolean =>
  Boolean(window.localStorage.getItem(tokenKey));

export const pairWithServer = async (
  pairingCode: string,
  deviceName: string,
): Promise<void> => {
  const response = await fetch('/api/pair', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      pairingCode,
      deviceId: getDeviceId(),
      deviceName,
    }),
  });
  const body: unknown = await response.json();

  if (!response.ok || !isRecord(body) || typeof body.token !== 'string') {
    throw new Error('Mindfull could not pair this device.');
  }

  window.localStorage.setItem(tokenKey, body.token);
  store.set(syncStatusAtom, 'idle');
};

const readCursor = async (): Promise<number> => {
  const storedCursor = await database.syncMeta.get(cursorKey);
  const cursor = Number.parseInt(storedCursor?.value ?? '0', 10);
  return Number.isFinite(cursor) ? cursor : 0;
};

export const synchronize = async (): Promise<void> => {
  const token = window.localStorage.getItem(tokenKey);

  if (!token) {
    store.set(syncStatusAtom, 'unpaired');
    return;
  }

  if (!navigator.onLine) {
    store.set(syncStatusAtom, 'offline');
    return;
  }

  if (store.get(syncStatusAtom) === 'syncing') {
    return;
  }

  store.set(syncStatusAtom, 'syncing');

  try {
    const [cursor, dirtyStates] = await Promise.all([
      readCursor(),
      database.syncState.filter(({ dirty }) => dirty === 1).toArray(),
    ]);
    const localDocuments = (
      await database.documents.bulkGet(
        dirtyStates.map(({ documentId }) => documentId),
      )
    ).filter((document) => document !== undefined);

    const response = await fetch('/api/sync', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ cursor, documents: localDocuments }),
    });

    if (response.status === 401) {
      window.localStorage.removeItem(tokenKey);
      store.set(syncStatusAtom, 'unpaired');
      return;
    }

    const body: unknown = await response.json();

    if (
      !response.ok ||
      !isRecord(body) ||
      typeof body.cursor !== 'number' ||
      !Array.isArray(body.documents)
    ) {
      throw new Error('Mindfull received an invalid sync response.');
    }

    const remoteDocuments = body.documents.map(parseDomainDocument);
    await applyRemoteDocuments(remoteDocuments, body.cursor);
    await database.syncMeta.put({ key: cursorKey, value: String(body.cursor) });
    store.set(syncStatusAtom, 'idle');
  } catch {
    store.set(syncStatusAtom, navigator.onLine ? 'error' : 'offline');
  }
};
