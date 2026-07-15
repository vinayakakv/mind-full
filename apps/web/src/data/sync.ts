import { parseDomainDocument } from '@mindfull/domain';
import { getDefaultStore } from 'jotai';

import { syncStatusAtom } from '../state/sync';
import { database } from './database';
import { getDeviceId } from './device';
import { dirtyDocumentsForSync } from './document-ownership';
import { applyRemoteDocuments } from './documents';

const tokenKey = 'mindfull.sync-token';
const serverAddressKey = 'mindfull.sync-server-address';
const cursorKey = 'server-cursor';
const pairingTimeoutMs = 10_000;
const store = getDefaultStore();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const hasPairingToken = (): boolean =>
  Boolean(window.localStorage.getItem(tokenKey));

export const syncServerAddress = (): string =>
  window.localStorage.getItem(serverAddressKey) ?? '';

export const normalizeSyncServerAddress = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const url = new URL(trimmed);
    const hasRootPath = url.pathname === '/' || url.pathname === '';
    const isHttp = url.protocol === 'http:' || url.protocol === 'https:';

    if (
      !isHttp ||
      !hasRootPath ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
};

export const configureSyncServer = async (value: string): Promise<string> => {
  const address = normalizeSyncServerAddress(value);
  if (address === null) {
    throw new Error('Enter a complete HTTP or HTTPS address.');
  }
  if (address === syncServerAddress()) return address;

  if (address) window.localStorage.setItem(serverAddressKey, address);
  else window.localStorage.removeItem(serverAddressKey);

  window.localStorage.removeItem(tokenKey);
  await database.syncMeta.delete(cursorKey);
  store.set(syncStatusAtom, 'unpaired');
  return address;
};

const syncEndpoint = (path: string): string => `${syncServerAddress()}${path}`;

export const pairWithServer = async (
  pairingCode: string,
  deviceName: string,
): Promise<void> => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), pairingTimeoutMs);
  let response: Response;

  try {
    response = await fetch(syncEndpoint('/api/pair'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pairingCode,
        deviceId: getDeviceId(),
        deviceName,
      }),
      signal: controller.signal,
    });
  } catch {
    throw new Error(
      controller.signal.aborted
        ? 'Mindfull could not reach that server in time.'
        : 'Mindfull could not reach that server.',
    );
  } finally {
    window.clearTimeout(timeout);
  }

  if (response.status === 401) {
    throw new Error('The pairing code was not accepted.');
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('That address does not appear to be a Mindfull server.');
  }

  if (!response.ok || !isRecord(body) || typeof body.token !== 'string') {
    throw new Error('Mindfull could not pair this device.');
  }

  window.localStorage.setItem(tokenKey, body.token);
  store.set(syncStatusAtom, 'idle');
};

let activeSynchronization: Promise<void> | null = null;
let isSynchronizationRequested = false;

const readCursor = async (): Promise<number> => {
  const storedCursor = await database.syncMeta.get(cursorKey);
  const cursor = Number.parseInt(storedCursor?.value ?? '0', 10);
  return Number.isFinite(cursor) ? cursor : 0;
};

const runSynchronization = async (): Promise<void> => {
  const token = window.localStorage.getItem(tokenKey);

  if (!token) {
    isSynchronizationRequested = false;
    store.set(syncStatusAtom, 'unpaired');
    return;
  }

  if (!navigator.onLine) {
    isSynchronizationRequested = false;
    store.set(syncStatusAtom, 'offline');
    return;
  }

  store.set(syncStatusAtom, 'syncing');

  try {
    while (isSynchronizationRequested) {
      isSynchronizationRequested = false;
      const [cursor, localDocuments] = await Promise.all([
        readCursor(),
        dirtyDocumentsForSync(getDeviceId()),
      ]);

      const response = await fetch(syncEndpoint('/api/sync'), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ cursor, documents: localDocuments }),
      });

      if (response.status === 401) {
        window.localStorage.removeItem(tokenKey);
        isSynchronizationRequested = false;
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
      await database.syncMeta.put({
        key: cursorKey,
        value: String(body.cursor),
      });
    }

    store.set(syncStatusAtom, 'idle');
  } catch {
    store.set(syncStatusAtom, navigator.onLine ? 'error' : 'offline');
  }
};

export const synchronize = (): Promise<void> => {
  isSynchronizationRequested = true;

  if (activeSynchronization) return activeSynchronization;

  activeSynchronization = runSynchronization().finally(() => {
    activeSynchronization = null;
  });
  return activeSynchronization;
};
