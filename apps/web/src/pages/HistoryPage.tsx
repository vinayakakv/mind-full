import { journalBody, journalHeading } from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { Button } from 'react-aria-components';
import { Link } from 'react-router';

import { TaskSuggestions } from '../components/TaskSuggestions';
import {
  filterHistoryEntries,
  type HistoryEntry,
  type HistoryFilter,
  loadHistoryPage,
} from '../data/history';
import styles from './HistoryPage.module.css';

const pageSize = 18;

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

function JournalHistoryEntry({
  entry,
}: {
  entry: Extract<HistoryEntry, { kind: 'journal' }>;
}) {
  const excerpt = markdownExcerpt(journalBody(entry.journal.payload));

  return (
    <Link
      className={styles.entryLink}
      to={`/journal?entry=${encodeURIComponent(entry.journal.id)}`}
    >
      <span className={styles.entryKind}>Journal</span>
      <strong>{journalTitle(entry)}</strong>
      {excerpt ? <span className={styles.excerpt}>{excerpt}</span> : null}
    </Link>
  );
}

function CheckInHistoryEntry({
  entry,
}: {
  entry: Extract<HistoryEntry, { kind: 'check-in' }>;
}) {
  const details = [
    entry.checkIn.payload.mood,
    ...entry.checkIn.payload.emotions,
  ].filter(Boolean);
  const kind = entry.checkIn.payload.kind === 'morning' ? 'Morning' : 'Evening';

  return (
    <Link
      className={styles.entryLink}
      to={`/check-ins/${encodeURIComponent(entry.checkIn.id)}`}
      state={{ returnTo: 'history' }}
    >
      <span className={styles.entryKind}>Check-in</span>
      <strong>{kind} check-in</strong>
      {details.length ? (
        <span className={styles.excerpt}>{details.join(' · ')}</span>
      ) : null}
    </Link>
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
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const continuation = useRef<HTMLDivElement>(null);
  const page = useLiveQuery(
    () => loadHistoryPage(filter, visibleCount),
    [filter, visibleCount],
  );
  const visibleEntries = filterHistoryEntries(page?.entries ?? [], filter);
  const hasMore = page?.hasMore ?? false;

  useEffect(() => {
    const target = continuation.current;
    if (!target || !hasMore) return;

    const observer = new IntersectionObserver(([observed]) => {
      if (observed?.isIntersecting) {
        setVisibleCount((count) => count + pageSize);
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore]);

  const selectFilter = (nextFilter: HistoryFilter) => {
    setFilter(nextFilter);
    setVisibleCount(pageSize);
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
                <JournalHistoryEntry entry={entry} />
              ) : null}
              {entry.kind === 'check-in' ? (
                <CheckInHistoryEntry entry={entry} />
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
            onPress={() => setVisibleCount((count) => count + pageSize)}
          >
            Load more
          </Button>
        </div>
      ) : null}
    </section>
  );
}
