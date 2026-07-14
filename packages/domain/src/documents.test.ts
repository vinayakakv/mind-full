import { describe, expect, it } from 'vitest';

import {
  createJournalDocument,
  createTaskDocument,
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
