import { createTaskDocument } from '@mindfull/domain';
import { describe, expect, it } from 'vitest';

import { orderTasksForList } from './tasks';

const task = (
  id: string,
  createdAt: string,
  completedAt: string | null = null,
) =>
  createTaskDocument({
    id,
    now: createdAt,
    deviceId: 'test',
    payload: {
      text: id,
      completedAt,
      availableFrom: null,
      reminderAt: null,
      source: { kind: 'manual' },
    },
  });

describe('task list ordering', () => {
  it('shows new active tasks first, followed by recently completed tasks', () => {
    const tasks = [
      task('older active', '2026-07-17T08:00:00.000Z'),
      task(
        'recently completed',
        '2026-07-16T08:00:00.000Z',
        '2026-07-19T09:00:00.000Z',
      ),
      task('newer active', '2026-07-19T08:00:00.000Z'),
      task(
        'earlier completed',
        '2026-07-18T08:00:00.000Z',
        '2026-07-18T09:00:00.000Z',
      ),
    ];

    expect(orderTasksForList(tasks).map(({ id }) => id)).toEqual([
      'newer active',
      'older active',
      'recently completed',
      'earlier completed',
    ]);
    expect(tasks.map(({ id }) => id)).toEqual([
      'older active',
      'recently completed',
      'newer active',
      'earlier completed',
    ]);
  });
});
