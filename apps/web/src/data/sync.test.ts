import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { database } from './database';
import {
  configureSyncServer,
  hasPairingToken,
  normalizeSyncServerAddress,
  pairWithServer,
  syncServerAddress,
} from './sync';

describe('sync server address', () => {
  beforeEach(async () => {
    await database.delete();
    await database.open();
    window.localStorage.clear();
  });

  afterAll(() => database.close());

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

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

  it('stores the token returned by a successful pairing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ token: 'phone-token' }), {
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    );

    await pairWithServer('quiet-code', 'Android phone');

    expect(hasPairingToken()).toBe(true);
  });

  it('stops a pairing request that takes too long', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('Request aborted', 'AbortError'));
            });
          }),
      ),
    );

    const pairing = expect(
      pairWithServer('quiet-code', 'Android phone'),
    ).rejects.toThrow('Mindfull could not reach that server in time.');

    await vi.advanceTimersByTimeAsync(10_000);
    await pairing;
  });
});
