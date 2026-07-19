import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { rebuildReflections } from './ai';

const configuration = {
  baseUrl: 'http://model.local/v1',
  hasApiKey: false,
  model: 'quiet-model',
  responseTimeoutMinutes: 5,
  paused: false,
  status: 'available',
  lastCheckedAt: null,
  lastSucceededAt: null,
  errorCode: null,
  pendingJobs: 1,
  failedJobs: 0,
  reflectionRebuild: null,
};

describe('AI commands', () => {
  beforeEach(() => {
    window.localStorage.setItem('mindfull.sync-token', 'phone-token');
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('sends the local date for a reflection rebuild', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            String(input).endsWith('/api/ai/configuration')
              ? configuration
              : { status: 'waiting' },
          ),
          { headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await rebuildReflections();

    const request = fetchMock.mock.calls[0];
    const init = request?.[1] as RequestInit | undefined;
    expect(String(request?.[0])).toBe('/api/ai/reflections/rebuild');
    expect(new Headers(init?.headers).get('content-type')).toBe(
      'application/json',
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      localDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });
});
