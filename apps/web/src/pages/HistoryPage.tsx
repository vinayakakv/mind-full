import { journalBody, journalHeading } from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAtom } from 'jotai';
import {
  type MouseEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Button } from 'react-aria-components';
import {
  Link,
  useLocation,
  useNavigate,
  useNavigationType,
} from 'react-router';

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
  historyViewAtom,
  historyViewFrom,
  initialHistoryView,
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
  rememberView,
}: {
  children: ReactNode;
  destination: string;
  rememberView: () => HistoryView;
}) {
  const navigate = useNavigate();

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

    event.preventDefault();
    navigate(destination, {
      state: { returnTo: 'history', historyView: rememberView() },
    });
  };

  return (
    <Link className={styles.entryLink} to={destination} onClick={openEntry}>
      {children}
    </Link>
  );
}

function JournalHistoryEntry({
  entry,
  rememberView,
}: {
  entry: Extract<HistoryEntry, { kind: 'journal' }>;
  rememberView: () => HistoryView;
}) {
  const excerpt = markdownExcerpt(journalBody(entry.journal.payload));

  return (
    <HistoryEntryLink
      destination={`/journal?entry=${encodeURIComponent(entry.journal.id)}`}
      rememberView={rememberView}
    >
      <span className={styles.entryKind}>Journal</span>
      <strong>{journalTitle(entry)}</strong>
      {excerpt ? <span className={styles.excerpt}>{excerpt}</span> : null}
    </HistoryEntryLink>
  );
}

function CheckInHistoryEntry({
  entry,
  rememberView,
}: {
  entry: Extract<HistoryEntry, { kind: 'check-in' }>;
  rememberView: () => HistoryView;
}) {
  const details = [
    entry.checkIn.payload.mood,
    ...entry.checkIn.payload.emotions,
  ].filter(Boolean);
  const kind = entry.checkIn.payload.kind === 'morning' ? 'Morning' : 'Evening';

  return (
    <HistoryEntryLink
      destination={`/check-ins/${encodeURIComponent(entry.checkIn.id)}`}
      rememberView={rememberView}
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
  const location = useLocation();
  const navigationType = useNavigationType();
  const [rememberedView, setRememberedView] = useAtom(historyViewAtom);
  const returningView = historyViewFrom(location.state);
  const startingView =
    returningView ??
    (navigationType === 'POP' ? rememberedView : initialHistoryView);
  const [filter, setFilter] = useState<HistoryFilter>(startingView.filter);
  const [visibleCount, setVisibleCount] = useState(startingView.visibleCount);
  const scrollToRestore = useRef<number | null>(startingView.scrollY);
  const continuation = useRef<HTMLDivElement>(null);
  const page = useLiveQuery(
    () => loadHistoryPage(filter, visibleCount),
    [filter, visibleCount],
  );
  const visibleEntries = filterHistoryEntries(page?.entries ?? [], filter);
  const hasMore = page?.hasMore ?? false;

  useLayoutEffect(() => {
    if (page === undefined || scrollToRestore.current === null) return;

    const scrollY = scrollToRestore.current;
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo(0, scrollY);
      scrollToRestore.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [page]);

  useEffect(() => {
    const target = continuation.current;
    if (!target || !hasMore) return;

    const observer = new IntersectionObserver(([observed]) => {
      if (observed?.isIntersecting) {
        setVisibleCount((count) => count + historyPageSize);
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore]);

  const selectFilter = (nextFilter: HistoryFilter) => {
    setFilter(nextFilter);
    setVisibleCount(historyPageSize);
  };

  const rememberView = (): HistoryView => {
    const view = { filter, visibleCount, scrollY: window.scrollY };
    setRememberedView(view);
    return view;
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
            aria-pressed={filter === value}
            onPress={() => selectFilter(value)}
          >
            {label}
          </Button>
        ))}
      </fieldset>

      <TaskSuggestions />

      {page && visibleEntries.length === 0 ? (
        <p className={styles.empty}>
          {filter === 'all'
            ? 'Your reflections and rhythms will gather here.'
            : `No ${filters.find(({ value }) => value === filter)?.label.toLowerCase()} have gathered yet.`}
        </p>
      ) : null}

      <ol className={styles.timeline}>
        {visibleEntries.map((entry, index) => {
          const beginsDateGroup =
            visibleEntries[index - 1]?.localDate !== entry.localDate;

          return (
            <li key={`${entry.kind}:${entry.id}`}>
              {beginsDateGroup ? (
                <h2>{formatLocalDate(entry.localDate)}</h2>
              ) : null}
              {entry.kind === 'journal' ? (
                <JournalHistoryEntry
                  entry={entry}
                  rememberView={rememberView}
                />
              ) : null}
              {entry.kind === 'check-in' ? (
                <CheckInHistoryEntry
                  entry={entry}
                  rememberView={rememberView}
                />
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
            onPress={() => setVisibleCount((count) => count + historyPageSize)}
          >
            Load more
          </Button>
        </div>
      ) : null}
    </section>
  );
}
