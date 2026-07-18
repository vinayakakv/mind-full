import type { HistoryFilter } from '../data/history';

export type HistoryView = {
  filter: HistoryFilter;
  pageCount: number;
  anchorId: string | null;
};

export const historyPageSize = 18;

export const initialHistoryView: HistoryView = {
  filter: 'all',
  pageCount: 1,
  anchorId: null,
};

const isHistoryFilter = (value: string | null): value is HistoryFilter =>
  value === 'all' ||
  value === 'journal' ||
  value === 'check-in' ||
  value === 'habit';

const pageCountFrom = (value: string | null): number => {
  if (!value || !/^\d+$/.test(value)) return 1;
  const pageCount = Number(value);
  return Number.isSafeInteger(pageCount) && pageCount > 0 ? pageCount : 1;
};

export const historyViewFrom = (searchParams: URLSearchParams): HistoryView => {
  const filter = searchParams.get('filter');
  const anchorId = searchParams.get('at')?.trim() || null;

  return {
    filter: isHistoryFilter(filter) ? filter : initialHistoryView.filter,
    pageCount: pageCountFrom(searchParams.get('pages')),
    anchorId,
  };
};

export const historySearchParamsFor = (view: HistoryView): URLSearchParams => {
  const searchParams = new URLSearchParams();
  if (view.filter !== initialHistoryView.filter) {
    searchParams.set('filter', view.filter);
  }
  if (view.pageCount > initialHistoryView.pageCount) {
    searchParams.set('pages', String(view.pageCount));
  }
  if (view.anchorId) searchParams.set('at', view.anchorId);
  return searchParams;
};

export const historyPathFor = (view: HistoryView): string => {
  const search = historySearchParamsFor(view).toString();
  return search ? `/history?${search}` : '/history';
};

export const returnToHistoryPath = (state: unknown): string => {
  if (!state || typeof state !== 'object' || !('historyPath' in state)) {
    return '/history';
  }

  const { historyPath } = state;
  return typeof historyPath === 'string' &&
    (historyPath === '/history' || historyPath.startsWith('/history?'))
    ? historyPath
    : '/history';
};
