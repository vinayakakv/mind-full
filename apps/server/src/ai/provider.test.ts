import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  ProviderResponseError,
  providerErrorCode,
  providerErrorMessage,
  reflectionOutputSchemaFor,
  suggestionDuplicateOutputSchema,
} from './provider.js';

const developedWeekProgress = {
  currentLocalDate: '2026-07-23',
  daysElapsed: 4,
  daysRemaining: 3,
  processedSourceCount: 3,
  phase: 'developing',
  isPartialWeek: true,
} as const;

const reflectionOutputSchema = reflectionOutputSchemaFor(developedWeekProgress);

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

  it('allows an early partial week to remain sparse', () => {
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
        summary: 'The first reflection of the week described a quiet morning.',
        brightSpots: [],
        difficultParts: [],
        supportiveActions: [],
        questionsToCarry: [],
      },
      taskSuggestions: [],
      habitSuggestions: [],
    };
    const beginningSchema = reflectionOutputSchemaFor({
      currentLocalDate: '2026-07-20',
      daysElapsed: 1,
      daysRemaining: 6,
      processedSourceCount: 1,
      phase: 'beginning',
      isPartialWeek: true,
    });

    expect(beginningSchema.safeParse(output).success).toBe(true);
    expect(reflectionOutputSchema.safeParse(output).success).toBe(false);
  });
});

describe('suggestion duplicate output schema', () => {
  it('requires one decision for every candidate', () => {
    const schema = suggestionDuplicateOutputSchema({
      taskCandidates: ['First', 'Second'],
      habitCandidates: ['Third'],
      existingTasks: [],
      existingHabits: [],
      previousTaskSuggestions: [],
      previousHabitSuggestions: [],
    });

    expect(
      schema.safeParse({
        taskDuplicates: [true, false],
        habitDuplicates: [false],
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        taskDuplicates: [true],
        habitDuplicates: [false],
      }).success,
    ).toBe(false);
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
