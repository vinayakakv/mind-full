import type { TaskDocument } from './documents.js';

const dayInMilliseconds = 24 * 60 * 60 * 1_000;

export const taskIdForSuggestion = (suggestionId: string): string =>
  `task:from-suggestion:${suggestionId}`;

export const completedTasksPastRetention = (
  tasks: TaskDocument[],
  now: string,
  retentionDays: number,
): TaskDocument[] => {
  const cutoff = new Date(now).getTime() - retentionDays * dayInMilliseconds;

  return tasks.filter(({ deletedAt, payload }) => {
    if (deletedAt || !payload.completedAt) return false;
    return new Date(payload.completedAt).getTime() <= cutoff;
  });
};
