import { describe, expect, it } from 'vitest';

import {
  createHabitDocument,
  createHabitLogDocument,
  createJournalDocument,
  createReminderDocument,
  createSettingsDocument,
  createTaskDocument,
  createTaskSuggestionDocument,
  migrateDomainDocument,
  nextDocumentTimestamp,
  selectWinningDocument,
} from './documents.js';

const now = '2026-07-14T12:00:00.000Z';

const makeTask = (updatedAt = now, deviceId = 'phone') =>
  createTaskDocument({
    id: '01-task',
    now: updatedAt,
    deviceId,
    sortKey: 'a0',
    payload: {
      text: 'Take a quiet walk',
      completedAt: null,
      availableFrom: null,
      reminderAt: null,
      source: { kind: 'manual' },
    },
  });

describe('domain documents', () => {
  it('gives older settings the gentle ambience default', () => {
    const settings = createSettingsDocument({
      id: 'settings',
      now,
      deviceId: 'phone',
      payload: {
        timezone: 'Asia/Kolkata',
        theme: 'system',
        ambience: 'gentle',
        morningStartsAt: '05:00',
        eveningStartsAt: '18:00',
        weeklyReviewDay: 0,
        weeklyReviewTime: '19:00',
        completedTaskRetentionDays: 7,
      },
    });
    const { ambience: _, ...olderPayload } = settings.payload;

    expect(
      migrateDomainDocument({ ...settings, payload: olderPayload }),
    ).toMatchObject({ payload: { ambience: 'gentle' } });
  });

  it('accepts a current document through the migration boundary', () => {
    expect(migrateDomainDocument(makeTask()).type).toBe('task');
  });

  it('rejects an empty task', () => {
    const task = makeTask();

    expect(() =>
      migrateDomainDocument({
        ...task,
        payload: { ...task.payload, text: '  ' },
      }),
    ).toThrow();
  });

  it('keeps task suggestions separate from accepted tasks', () => {
    const suggestion = createTaskSuggestionDocument({
      id: '01-suggestion',
      now,
      deviceId: 'phone',
      payload: {
        proposedText: 'Call Mum',
        availableFrom: null,
        sourceDocumentId: '01-journal',
        sourceContentHash: 'content-hash',
        state: 'pending',
        acceptedTaskId: null,
      },
    });

    expect(migrateDomainDocument(suggestion)).toEqual(suggestion);
  });

  it('requires an accepted suggestion to name its task', () => {
    expect(() =>
      createTaskSuggestionDocument({
        id: '01-suggestion',
        now,
        deviceId: 'phone',
        payload: {
          proposedText: 'Call Mum',
          availableFrom: null,
          sourceDocumentId: '01-journal',
          sourceContentHash: 'content-hash',
          state: 'accepted',
          acceptedTaskId: null,
        },
      }),
    ).toThrow();
  });

  it('preserves journal markdown through the document boundary', () => {
    const journal = createJournalDocument({
      id: '01-journal',
      now,
      deviceId: 'phone',
      payload: {
        title: null,
        markdown: '# A small moment\n\nTea by the window.',
        localDate: '2026-07-14',
        timezone: 'Asia/Kolkata',
      },
    });

    expect(migrateDomainDocument(journal)).toEqual(journal);
  });

  it('validates a habit and its occurrence log', () => {
    const habit = createHabitDocument({
      id: '01-habit',
      now,
      deviceId: 'phone',
      payload: {
        name: 'Take a walk',
        weekdays: [1, 3, 5],
        reminderTime: '17:30',
        archivedAt: null,
      },
    });
    const log = createHabitLogDocument({
      id: 'habit-log:01-habit:2026-07-14',
      now,
      deviceId: 'phone',
      payload: {
        habitId: habit.id,
        localDate: '2026-07-14',
        timezone: 'Asia/Kolkata',
        outcome: 'completed',
        reason: null,
      },
    });

    expect(migrateDomainDocument(habit).type).toBe('habit');
    expect(migrateDomainDocument(log).type).toBe('habit-log');
  });

  it('validates a reminder as its own synchronized document', () => {
    const reminder = createReminderDocument({
      id: 'reminder:habit:01-habit',
      now,
      deviceId: 'phone',
      payload: {
        targetType: 'habit',
        targetId: '01-habit',
        scheduledAt: null,
        localTime: '17:30',
        weekdays: [1, 3, 5],
        enabled: true,
      },
    });

    expect(migrateDomainDocument(reminder)).toEqual(reminder);
  });

  it('rejects an ambiguous reminder schedule', () => {
    expect(() =>
      createReminderDocument({
        id: 'reminder:task:01-task',
        now,
        deviceId: 'phone',
        payload: {
          targetType: 'task',
          targetId: '01-task',
          scheduledAt: '2026-07-15T12:00:00.000Z',
          localTime: '17:30',
          weekdays: [1, 3, 5],
          enabled: true,
        },
      }),
    ).toThrow();
  });

  it('selects the document with the later timestamp', () => {
    const earlier = makeTask('2026-07-14T12:00:00.000Z');
    const later = makeTask('2026-07-14T12:01:00.000Z');

    expect(selectWinningDocument(earlier, later)).toBe(later);
  });

  it('uses the device id as a deterministic timestamp tie-breaker', () => {
    const phone = makeTask(now, 'phone');
    const desktop = makeTask(now, 'desktop');

    expect(selectWinningDocument(phone, desktop)).toBe(phone);
    expect(selectWinningDocument(desktop, phone)).toBe(phone);
  });

  it('allows a newer tombstone to win', () => {
    const task = makeTask('2026-07-14T12:00:00.000Z');
    const deleted = {
      ...task,
      updatedAt: '2026-07-14T12:05:00.000Z',
      deletedAt: '2026-07-14T12:05:00.000Z',
    };

    expect(selectWinningDocument(task, deleted).deletedAt).not.toBeNull();
  });

  it('keeps rapid edits monotonically ordered', () => {
    expect(nextDocumentTimestamp(now, now)).toBe('2026-07-14T12:00:00.001Z');
  });
});
