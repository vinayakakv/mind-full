import { atom } from 'jotai';

import type { HistoryFilter } from '../data/history';

export type HistoryView = {
  filter: HistoryFilter;
  visibleCount: number;
  scrollY: number;
};

export const historyPageSize = 18;

export const initialHistoryView: HistoryView = {
  filter: 'all',
  visibleCount: historyPageSize,
  scrollY: 0,
};

export const historyViewAtom = atom(initialHistoryView);

const isHistoryFilter = (value: unknown): value is HistoryFilter =>
  value === 'all' ||
  value === 'journal' ||
  value === 'check-in' ||
  value === 'habit';

export const historyViewFrom = (state: unknown): HistoryView | null => {
  if (!state || typeof state !== 'object' || !('historyView' in state)) {
    return null;
  }

  const view = state.historyView;
  if (
    !view ||
    typeof view !== 'object' ||
    !('filter' in view) ||
    !isHistoryFilter(view.filter) ||
    !('visibleCount' in view) ||
    typeof view.visibleCount !== 'number' ||
    !Number.isInteger(view.visibleCount) ||
    !('scrollY' in view) ||
    typeof view.scrollY !== 'number' ||
    !Number.isFinite(view.scrollY)
  ) {
    return null;
  }

  return {
    filter: view.filter,
    visibleCount: Math.max(historyPageSize, view.visibleCount),
    scrollY: Math.max(0, view.scrollY),
  };
};

export const returnToHistoryState = (state: unknown) => {
  const historyView = historyViewFrom(state);
  return historyView ? { historyView } : undefined;
};
