import { journalBody, journalHeading } from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react';
import { Button } from 'react-aria-components';
import { Link, useSearchParams } from 'react-router';

import { TaskSuggestions } from '../components/TaskSuggestions';
import {
  filterHistoryEntries,
  type HistoryEntry,
  type HistoryFilter,
  loadHistoryPage,
} from '../data/history';
import styles from './HistoryPage.module.css';
import {
  type HistoryView,
  historyPageSize,
  historyPathFor,
  historySearchParamsFor,
  historyViewFrom,
} from './history-view';

const filters: Array<{ value: HistoryFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'journal', label: 'Journals' },
  { value: 'check-in', label: 'Check-ins' },
  { value: 'habit', label: 'Habits' },
];

const formatLocalDate = (localDate: string): string =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year:
      new Date().getFullYear().toString() === localDate.slice(0, 4)
        ? undefined
        : 'numeric',
  }).format(new Date(`${localDate}T12:00:00`));

const journalTitle = (entry: Extract<HistoryEntry, { kind: 'journal' }>) =>
  journalHeading(entry.journal.payload, formatLocalDate(entry.localDate));

const markdownExcerpt = (markdown: string): string =>
  markdown
    .replace(/[#>*_`~-]/g, ' ')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150);

function HistoryEntryLink({
  children,
  destination,
  returnPath,
}: {
  children: ReactNode;
  destination: string;
  returnPath: string;
}) {
  const openEntry = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    window.history.replaceState(window.history.state, '', returnPath);
  };

  return (
    <Link
      className={styles.entryLink}
      to={destination}
      state={{ returnTo: 'history', historyPath: returnPath }}
      onClick={openEntry}
    >
      {children}
    </Link>
  );
}

function JournalHistoryEntry({
  entry,
  returnPath,
}: {
  entry: Extract<HistoryEntry, { kind: 'journal' }>;
  returnPath: string;
}) {
  const excerpt = markdownExcerpt(journalBody(entry.journal.payload));

  return (
    <HistoryEntryLink
      destination={`/journal?entry=${encodeURIComponent(entry.journal.id)}`}
      returnPath={returnPath}
    >
      <span className={styles.entryKind}>Journal</span>
      <strong>{journalTitle(entry)}</strong>
      {excerpt ? <span className={styles.excerpt}>{excerpt}</span> : null}
    </HistoryEntryLink>
  );
}

function CheckInHistoryEntry({
  entry,
  returnPath,
}: {
  entry: Extract<HistoryEntry, { kind: 'check-in' }>;
  returnPath: string;
}) {
  const details = [
    entry.checkIn.payload.mood,
    ...entry.checkIn.payload.emotions,
  ].filter(Boolean);
  const kind = entry.checkIn.payload.kind === 'morning' ? 'Morning' : 'Evening';

  return (
    <HistoryEntryLink
      destination={`/check-ins/${encodeURIComponent(entry.checkIn.id)}`}
      returnPath={returnPath}
    >
      <span className={styles.entryKind}>Check-in</span>
      <strong>{kind} check-in</strong>
      {details.length ? (
        <span className={styles.excerpt}>{details.join(' · ')}</span>
      ) : null}
    </HistoryEntryLink>
  );
}

function HabitHistoryEntry({
  entry,
}: {
  entry: Extract<HistoryEntry, { kind: 'habit' }>;
}) {
  const isCompleted = entry.habitLog.payload.outcome === 'completed';

  return (
    <div className={styles.habitEntry}>
      <span className={styles.entryKind}>Habit</span>
      <strong>{entry.habitName}</strong>
      <span className={styles.excerpt}>
        {isCompleted ? 'Completed' : 'Recorded as missed'}
        {entry.habitLog.payload.reason
          ? ` · ${entry.habitLog.payload.reason}`
          : ''}
      </span>
    </div>
  );
}

export function HistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = historyViewFrom(searchParams);
  const visibleCount = view.pageCount * historyPageSize;
  const restoredAnchor = useRef<string | null>(null);
  const continuation = useRef<HTMLDivElement>(null);
  const page = useLiveQuery(
    async () => ({
      ...(await loadHistoryPage(view.filter, visibleCount)),
      requestedCount: visibleCount,
    }),
    [view.filter, visibleCount],
  );
  const visibleEntries = filterHistoryEntries(page?.entries ?? [], view.filter);
  const hasMore =
    page?.requestedCount === visibleCount && (page?.hasMore ?? false);

  useLayoutEffect(() => {
    if (
      page === undefined ||
      !view.anchorId ||
      restoredAnchor.current === view.anchorId
    ) {
      return;
    }

    const anchor = document.getElementById(view.anchorId);
    if (!anchor) return;
    const frame = window.requestAnimationFrame(() => {
      anchor.scrollIntoView({ block: 'center' });
      restoredAnchor.current = view.anchorId;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [page, view.anchorId]);

  const updateView = useCallback(
    (nextView: HistoryView) => {
      setSearchParams(historySearchParamsFor(nextView), {
        replace: true,
        preventScrollReset: true,
      });
    },
    [setSearchParams],
  );

  useEffect(() => {
    const target = continuation.current;
    if (!target || !hasMore) return;

    const observer = new IntersectionObserver(([observed]) => {
      if (observed?.isIntersecting) {
        updateView({ ...view, pageCount: view.pageCount + 1 });
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, updateView, view]);

  const selectFilter = (nextFilter: HistoryFilter) => {
    updateView({ filter: nextFilter, pageCount: 1, anchorId: null });
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>What has gathered</p>
        <h1>History</h1>
        <p>A quiet record of what was written, noticed, and completed.</p>
      </header>

      <fieldset className={styles.filters}>
        <legend className="visually-hidden">Filter history</legend>
        {filters.map(({ value, label }) => (
          <Button
            key={value}
            className={styles.filter}
            aria-pressed={view.filter === value}
            onPress={() => selectFilter(value)}
          >
            {label}
          </Button>
        ))}
      </fieldset>

      <TaskSuggestions />

      {page && visibleEntries.length === 0 ? (
        <p className={styles.empty}>
          {view.filter === 'all'
            ? 'Your reflections and rhythms will gather here.'
            : `No ${filters.find(({ value }) => value === view.filter)?.label.toLowerCase()} have gathered yet.`}
        </p>
      ) : null}

      <ol className={styles.timeline}>
        {visibleEntries.map((entry, index) => {
          const beginsDateGroup =
            visibleEntries[index - 1]?.localDate !== entry.localDate;
          const anchorId = `history-${entry.kind}-${entry.id}`;
          const returnPath = historyPathFor({ ...view, anchorId });

          return (
            <li id={anchorId} key={`${entry.kind}:${entry.id}`}>
              {beginsDateGroup ? (
                <h2>{formatLocalDate(entry.localDate)}</h2>
              ) : null}
              {entry.kind === 'journal' ? (
                <JournalHistoryEntry entry={entry} returnPath={returnPath} />
              ) : null}
              {entry.kind === 'check-in' ? (
                <CheckInHistoryEntry entry={entry} returnPath={returnPath} />
              ) : null}
              {entry.kind === 'habit' ? (
                <HabitHistoryEntry entry={entry} />
              ) : null}
            </li>
          );
        })}
      </ol>

      {hasMore ? (
        <div className={styles.continuation} ref={continuation}>
          <Button
            className={styles.loadMore}
            onPress={() =>
              updateView({ ...view, pageCount: view.pageCount + 1 })
            }
          >
            Load more
          </Button>
        </div>
      ) : null}
    </section>
  );
}
