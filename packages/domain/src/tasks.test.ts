import { describe, expect, it } from 'vitest';

import { createTaskDocument } from './documents.js';
import { completedTasksPastRetention, taskIdForSuggestion } from './tasks.js';

const taskCompletedAt = (
  completedAt: string | null,
  deletedAt: string | null = null,
) => ({
  ...createTaskDocument({
    id: completedAt ?? 'open-task',
    now: '2026-07-01T09:00:00.000Z',
    deviceId: 'test-device',
    payload: {
      text: 'Take a quiet walk',
      completedAt,
      availableFrom: null,
      reminderAt: null,
      source: { kind: 'manual' },
    },
  }),
  deletedAt,
});

describe('completed task retention', () => {
  it('expires a completed task at the retention boundary', () => {
    const expired = taskCompletedAt('2026-07-08T12:00:00.000Z');
    const stillVisible = taskCompletedAt('2026-07-08T12:00:00.001Z');

    expect(
      completedTasksPastRetention(
        [expired, stillVisible],
        '2026-07-15T12:00:00.000Z',
        7,
      ),
    ).toEqual([expired]);
  });

  it('ignores open tasks and existing tombstones', () => {
    const open = taskCompletedAt(null);
    const deleted = taskCompletedAt(
      '2026-07-01T12:00:00.000Z',
      '2026-07-09T12:00:00.000Z',
    );

    expect(
      completedTasksPastRetention(
        [open, deleted],
        '2026-07-15T12:00:00.000Z',
        7,
      ),
    ).toEqual([]);
  });
});

describe('suggested task identity', () => {
  it('is stable across devices', () => {
    expect(taskIdForSuggestion('01-suggestion')).toBe(
      'task:from-suggestion:01-suggestion',
    );
  });
});
