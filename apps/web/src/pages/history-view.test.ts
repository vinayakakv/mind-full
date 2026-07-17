import { describe, expect, it } from 'vitest';

import {
  historyPageSize,
  historyViewFrom,
  returnToHistoryState,
} from './history-view';

describe('history view navigation state', () => {
  it('keeps the loaded depth, filter, and scroll position', () => {
    const historyView = {
      filter: 'journal' as const,
      visibleCount: 54,
      scrollY: 1280,
    };

    expect(historyViewFrom({ historyView })).toEqual(historyView);
    expect(returnToHistoryState({ historyView })).toEqual({ historyView });
  });

  it('ignores malformed navigation state', () => {
    expect(historyViewFrom(null)).toBeNull();
    expect(
      historyViewFrom({
        historyView: {
          filter: 'settings',
          visibleCount: historyPageSize,
          scrollY: 10,
        },
      }),
    ).toBeNull();
    expect(
      historyViewFrom({
        historyView: {
          filter: 'all',
          visibleCount: 18.5,
          scrollY: 10,
        },
      }),
    ).toBeNull();
  });
});
