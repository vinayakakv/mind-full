import { describe, expect, it } from 'vitest';

import {
  ProviderResponseError,
  providerErrorCode,
  providerErrorMessage,
} from './provider.js';

describe('model provider errors', () => {
  it('distinguishes a refused connection from a missing hostname', () => {
    expect(providerErrorCode({ cause: { code: 'ECONNREFUSED' } })).toBe(
      'connection-refused',
    );
    expect(providerErrorCode({ cause: { code: 'ENOTFOUND' } })).toBe(
      'dns-not-found',
    );
  });

  it('explains authentication and OpenAI endpoint failures safely', () => {
    expect(
      providerErrorCode(new ProviderResponseError(401, 'secret body')),
    ).toBe('authentication-failed');
    expect(
      providerErrorMessage(new ProviderResponseError(404, 'server body')),
    ).toContain('/models');
  });
});
