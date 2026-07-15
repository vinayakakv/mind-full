import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { database } from './database';
import {
  configureSyncServer,
  normalizeSyncServerAddress,
  syncServerAddress,
} from './sync';

describe('sync server address', () => {
  beforeEach(async () => {
    await database.delete();
    await database.open();
    window.localStorage.clear();
  });

  afterAll(() => database.close());

  it('keeps same-origin empty and normalizes an absolute address', () => {
    expect(normalizeSyncServerAddress('  ')).toBe('');
    expect(normalizeSyncServerAddress('https://mindfull.example/')).toBe(
      'https://mindfull.example',
    );
    expect(normalizeSyncServerAddress('http://10.0.2.2:3001')).toBe(
      'http://10.0.2.2:3001',
    );
  });

  it('rejects non-http and mounted-path addresses', () => {
    expect(normalizeSyncServerAddress('mindfull.example')).toBeNull();
    expect(normalizeSyncServerAddress('file:///mindfull')).toBeNull();
    expect(
      normalizeSyncServerAddress('https://mindfull.example/somewhere'),
    ).toBeNull();
  });

  it('forgets server credentials and cursor when the address changes', async () => {
    window.localStorage.setItem('mindfull.sync-token', 'old-token');
    await database.syncMeta.put({ key: 'server-cursor', value: '42' });

    await configureSyncServer('http://10.0.2.2:3001/');

    expect(syncServerAddress()).toBe('http://10.0.2.2:3001');
    expect(window.localStorage.getItem('mindfull.sync-token')).toBeNull();
    expect(await database.syncMeta.get('server-cursor')).toBeUndefined();
  });
});
