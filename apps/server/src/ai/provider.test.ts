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

  it('requires a grounded weekly detail outside the summary', () => {
    const output = {
      updatedMemory: {
        context: [],
        supportivePatterns: [],
        recurringThemes: [],
        ongoingCommitments: [],
        openQuestions: [],
        uncertainImpressions: [],
      },
      updatedWeek: {
        summary: 'The week held a mix of effort and rest.',
        brightSpots: [],
        difficultParts: [],
        supportiveActions: [],
        questionsToCarry: [],
      },
      taskSuggestions: [],
      habitSuggestions: [],
    };

    expect(reflectionOutputSchema.safeParse(output).success).toBe(false);
    expect(
      reflectionOutputSchema.safeParse({
        ...output,
        updatedWeek: {
          ...output.updatedWeek,
          supportiveActions: ['Taking a short walk offered some space.'],
        },
      }).success,
    ).toBe(true);
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
