import { describe, expect, it } from 'vitest';

import { providerBackoffMs, reflectionMemoryMarkdown } from './worker.js';

describe('AI provider backoff', () => {
  it('becomes quiet without exceeding six hours', () => {
    expect(providerBackoffMs(1)).toBe(15_000);
    expect(providerBackoffMs(3)).toBe(5 * 60_000);
    expect(providerBackoffMs(20)).toBe(6 * 3_600_000);
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
});
