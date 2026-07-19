import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  ProviderResponseError,
  providerErrorCode,
  providerErrorMessage,
  reflectionOutputSchema,
} from './provider.js';

describe('reflection output schema', () => {
  it('keeps grammar bounds finite and compatible', () => {
    const schema = z.toJSONSchema(reflectionOutputSchema) as unknown as {
      properties: {
        habitSuggestions: { maxItems: number };
        updatedWeek: {
          properties: { summary: { maxLength: number } };
        };
      };
    };

    expect(schema.properties.habitSuggestions.maxItems).toBe(2);
    expect(schema.properties.updatedWeek.properties.summary.maxLength).toBe(
      1_200,
    );
  });
});

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
