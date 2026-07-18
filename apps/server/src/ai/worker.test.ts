import { describe, expect, it } from 'vitest';

import {
  jobLeaseDurationMs,
  providerBackoffMs,
  reflectionMemoryMarkdown,
  reflectionMemoryMarkdownFor,
  weekBounds,
} from './worker.js';

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
