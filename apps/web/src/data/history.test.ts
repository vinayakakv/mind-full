import {
  createCheckInDocument,
  createHabitDocument,
  createHabitLogDocument,
  createJournalDocument,
  createTaskDocument,
} from '@mindfull/domain';
import { describe, expect, it } from 'vitest';

import { filterHistoryEntries, historyEntriesFrom } from './history';

const now = '2026-07-15T12:00:00.000Z';
const envelope = { now, deviceId: 'phone' };

describe('history entries', () => {
  it('projects only human activity in reverse local-date order', () => {
    const habit = createHabitDocument({
      ...envelope,
      id: 'walk',
      payload: {
        name: 'Take a walk',
        weekdays: [1, 3, 5],
        schedules: [],
        reminderTime: null,
        archivedAt: null,
      },
    });
    const habitLog = createHabitLogDocument({
      ...envelope,
      id: 'habit-log:walk:2026-07-14',
      payload: {
        habitId: habit.id,
        localDate: '2026-07-14',
        timezone: 'Asia/Kolkata',
        outcome: 'completed',
        reason: null,
      },
    });
    const journal = createJournalDocument({
      ...envelope,
      id: 'journal',
      payload: {
        title: 'A quiet afternoon',
        markdown: 'The rain arrived.',
        localDate: '2026-07-15',
        timezone: 'Asia/Kolkata',
        status: 'completed',
        completedAt: now,
      },
    });
    const emptyJournal = createJournalDocument({
      ...envelope,
      id: 'empty-journal',
      payload: {
        title: null,
        markdown: '',
        localDate: '2026-07-15',
        timezone: 'Asia/Kolkata',
        status: 'completed',
        completedAt: now,
      },
    });
    const draftJournal = {
      ...journal,
      id: 'journal-draft',
      payload: {
        ...journal.payload,
        status: 'draft' as const,
        completedAt: null,
      },
    };
    const task = createTaskDocument({
      ...envelope,
      id: 'task',
      payload: {
        text: 'Not a history event',
        completedAt: now,
        availableFrom: null,
        reminderAt: null,
        source: { kind: 'manual' },
      },
    });

    const entries = historyEntriesFrom([
      habitLog,
      task,
      emptyJournal,
      habit,
      journal,
      draftJournal,
    ]);

    expect(entries.map(({ id }) => id)).toEqual(['journal', habitLog.id]);
    expect(entries[1]).toMatchObject({
      kind: 'habit',
      habitName: 'Take a walk',
    });
  });

  it('includes only completed check-ins and filters by kind', () => {
    const completed = createCheckInDocument({
      ...envelope,
      id: 'evening',
      payload: {
        kind: 'evening',
        localDate: '2026-07-15',
        timezone: 'Asia/Kolkata',
        status: 'completed',
        currentStep: 8,
        mood: 'Content',
        energy: null,
        stress: 'Quiet',
        emotions: ['Grateful'],
        responses: [],
        reflectionMarkdown: null,
        completedAt: now,
      },
    });
    const draft = {
      ...completed,
      id: 'morning-draft',
      payload: {
        ...completed.payload,
        kind: 'morning' as const,
        status: 'draft' as const,
        completedAt: null,
      },
    };

    const entries = historyEntriesFrom([completed, draft]);
    expect(filterHistoryEntries(entries, 'check-in')).toHaveLength(1);
    expect(filterHistoryEntries(entries, 'journal')).toHaveLength(0);
  });
});
