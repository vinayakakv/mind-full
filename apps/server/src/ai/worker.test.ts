import { createJournalDocument } from '@mindfull/domain';
import { NoObjectGeneratedError } from 'ai';
import { describe, expect, it } from 'vitest';

import type {
  AiInvoker,
  ProviderConfiguration,
  ReflectionOutput,
} from './provider.js';
import {
  checkSuggestionNovelty,
  chronologicalSourceText,
  jobLeaseDurationMs,
  outputAttemptDiagnostic,
  providerBackoffMs,
  reflectionMemoryMarkdown,
  reflectionMemoryMarkdownFor,
  weekBounds,
  weekProgress,
} from './worker.js';

const providerConfiguration: ProviderConfiguration = {
  baseUrl: 'http://model.local/v1',
  apiKey: '',
  model: 'quiet-model',
  responseTimeoutMinutes: 5,
};

const reflectionOutput = (): ReflectionOutput => ({
  updatedMemory: {
    context: [],
    supportivePatterns: [],
    recurringThemes: [],
    ongoingCommitments: [],
    openQuestions: [],
    uncertainImpressions: [],
  },
  updatedWeek: {
    summary: 'A quiet week.',
    brightSpots: ['A restorative pause.'],
    difficultParts: [],
    supportiveActions: [],
    questionsToCarry: [],
  },
  taskSuggestions: [{ text: 'Call the clinic', reason: null }],
  habitSuggestions: [{ text: 'Stretch each morning', reason: null }],
});

const usage = {
  inputTokens: 5_419,
  inputTokenDetails: {
    noCacheTokens: 31,
    cacheReadTokens: 5_388,
    cacheWriteTokens: 0,
  },
  outputTokens: 2_121,
  outputTokenDetails: { textTokens: 2_121, reasoningTokens: 0 },
  totalTokens: 7_540,
};

describe('AI provider backoff', () => {
  it('becomes quiet without exceeding six hours', () => {
    expect(providerBackoffMs(1)).toBe(15_000);
    expect(providerBackoffMs(3)).toBe(5 * 60_000);
    expect(providerBackoffMs(20)).toBe(6 * 3_600_000);
  });
});

describe('AI job lease', () => {
  it('covers reflection, duplicate checking, and a final margin', () => {
    expect(jobLeaseDurationMs(10)).toBe(13 * 60_000);
  });
});

describe('suggestion novelty check', () => {
  it('omits optional suggestions when duplicate checking fails', async () => {
    let warned = false;
    const invoker: AiInvoker = {
      reflect: async () => reflectionOutput(),
      findSuggestionDuplicates: async () => {
        throw new Error('The model became unavailable.');
      },
      rebuildWeek: async () => ({
        updatedWeek: reflectionOutput().updatedWeek,
      }),
    };

    const checked = await checkSuggestionNovelty(
      invoker,
      providerConfiguration,
      reflectionOutput(),
      {
        existingTasks: [],
        existingHabits: [],
        previousTaskSuggestions: [],
        previousHabitSuggestions: [],
      },
      () => {
        warned = true;
      },
    );

    expect(checked.taskSuggestions).toEqual([]);
    expect(checked.habitSuggestions).toEqual([]);
    expect(checked.updatedMemory).toEqual(reflectionOutput().updatedMemory);
    expect(warned).toBe(true);
  });
});

describe('AI output diagnostics', () => {
  it('keeps safe SDK and Mindfull validation details without output text', () => {
    const cause = Object.assign(new Error('contains private output'), {
      issues: [
        {
          code: 'too_small',
          path: ['updatedWeek', 'summary'],
          input: 'private output',
        },
      ],
    });
    const sdkError = new NoObjectGeneratedError({
      cause,
      text: 'private generated JSON',
      response: {
        id: 'response-id',
        timestamp: new Date('2026-07-18T00:00:00.000Z'),
        modelId: 'quiet-model',
      },
      usage,
      finishReason: 'length',
    });

    const diagnostics = [
      outputAttemptDiagnostic(sdkError, 1),
      outputAttemptDiagnostic(
        new NoObjectGeneratedError({
          cause: Object.assign(new Error('contains private output'), {
            issues: [{ code: 'too_big', path: ['taskSuggestions'] }],
          }),
          text: 'private generated JSON',
          response: {
            id: 'response-id-2',
            timestamp: new Date('2026-07-18T00:00:01.000Z'),
            modelId: 'quiet-model',
          },
          usage,
          finishReason: 'stop',
        }),
        2,
      ),
    ];

    expect(diagnostics).toEqual([
      {
        attempt: 1,
        failure: 'schema-validation',
        finishReason: 'length',
        inputTokens: 5_419,
        outputTokens: 2_121,
        totalTokens: 7_540,
        issues: ['updatedWeek.summary:too_small'],
      },
      {
        attempt: 2,
        failure: 'schema-validation',
        finishReason: 'stop',
        inputTokens: 5_419,
        outputTokens: 2_121,
        totalTokens: 7_540,
        issues: ['taskSuggestions:too_big'],
      },
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain('private');
  });
});

describe('reflection memory formatting', () => {
  it('keeps app-supplied dates out of chronological model input', () => {
    const now = '2026-07-19T08:00:00.000Z';
    const journal = createJournalDocument({
      id: 'journal-one',
      now,
      deviceId: 'phone',
      payload: {
        title: null,
        markdown: 'Tea by the window felt restorative.',
        localDate: '2026-07-14',
        timezone: 'Asia/Kolkata',
        status: 'completed',
        completedAt: now,
      },
    });

    expect(chronologicalSourceText([journal])).toBe(
      '[journal]\nTea by the window felt restorative.',
    );
  });

  it('removes a model-added title without changing the memory sections', () => {
    expect(
      reflectionMemoryMarkdown(
        '# Reflection memory\n\nContext worth remembering: A quiet walk.',
      ),
    ).toBe('Context worth remembering: A quiet walk.');
  });

  it('renders bounded sections as readable Markdown', () => {
    expect(
      reflectionMemoryMarkdownFor({
        context: ['Quiet mornings matter.'],
        supportivePatterns: [],
        recurringThemes: [],
        ongoingCommitments: [],
        openQuestions: [],
        uncertainImpressions: [],
      }),
    ).toContain(
      '## Context worth remembering\n- Quiet mornings matter.\n\n## What appears supportive\n- None noted.',
    );
  });
});

describe('current-week bounds', () => {
  it('uses a local Monday through Sunday week across month boundaries', () => {
    expect(weekBounds('2026-08-01')).toEqual({
      weekStart: '2026-07-27',
      weekEnd: '2026-08-02',
    });
    expect(weekBounds('2026-08-02')).toEqual({
      weekStart: '2026-07-27',
      weekEnd: '2026-08-02',
    });
  });

  it('treats one or two processed sources as the beginning of a partial week', () => {
    expect(weekProgress('2026-07-21', ['morning', 'morning'])).toEqual({
      currentLocalDate: '2026-07-21',
      daysElapsed: 2,
      daysRemaining: 5,
      processedSourceCount: 1,
      phase: 'beginning',
      isPartialWeek: true,
    });
    expect(
      weekProgress('2026-07-22', ['morning', 'journal', 'evening']).phase,
    ).toBe('developing');
  });
});
