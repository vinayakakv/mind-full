import { NoObjectGeneratedError } from 'ai';
import { describe, expect, it } from 'vitest';

import {
  jobLeaseDurationMs,
  outputAttemptDiagnostic,
  providerBackoffMs,
  reflectionMemoryMarkdown,
  reflectionMemoryMarkdownFor,
  weekBounds,
} from './worker.js';

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
  it('stays one minute beyond the selected response timeout', () => {
    expect(jobLeaseDurationMs(10)).toBe(11 * 60_000);
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
});
