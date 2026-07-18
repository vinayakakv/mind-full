import { describe, expect, it } from 'vitest';

import {
  historyPathFor,
  historyViewFrom,
  returnToHistoryPath,
} from './history-view';

describe('history view URL', () => {
  it('keeps the loaded pages, filter, and entry anchor', () => {
    const view = historyViewFrom(
      new URLSearchParams('filter=journal&pages=3&at=history-journal-entry-42'),
    );

    expect(view).toEqual({
      filter: 'journal',
      pageCount: 3,
      anchorId: 'history-journal-entry-42',
    });
    expect(historyPathFor(view)).toBe(
      '/history?filter=journal&pages=3&at=history-journal-entry-42',
    );
  });

  it('falls back from malformed parameters', () => {
    expect(
      historyViewFrom(new URLSearchParams('filter=settings&pages=-2&at=%20')),
    ).toEqual({ filter: 'all', pageCount: 1, anchorId: null });
    expect(
      historyPathFor({ filter: 'all', pageCount: 1, anchorId: null }),
    ).toBe('/history');
  });

  it('accepts only a history return path', () => {
    const historyPath = '/history?filter=check-in&pages=2&at=entry';
    expect(returnToHistoryPath({ historyPath })).toBe(historyPath);
    expect(returnToHistoryPath({ historyPath: '/settings' })).toBe('/history');
    expect(returnToHistoryPath(null)).toBe('/history');
  });
});
