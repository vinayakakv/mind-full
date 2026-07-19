import {
  type HabitLogPayload,
  habitOccurrenceStatus,
  recentCalendarDates,
} from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Button } from 'react-aria-components';
import { Link } from 'react-router';

import {
  loadHabitDocuments,
  restoreHabitOccurrence,
  setHabitCompleted,
} from '../data/habits';
import { localDateFor } from '../data/time';
import { useCurrentTime } from '../hooks/use-current-time';
import habitStyles from './HabitHistory.module.css';
import styles from './HabitsPage.module.css';

const formatDay = (localDate: string): { weekday: string; day: string } => {
  const date = new Date(`${localDate}T12:00:00`);
  return {
    weekday: new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(
      date,
    ),
    day: new Intl.DateTimeFormat(undefined, { day: 'numeric' }).format(date),
  };
};

const startedOn = (createdAt: string): string =>
  localDateFor(new Date(createdAt));

type UndoChange = {
  habitId: string;
  habitName: string;
  localDate: string;
  previousLog: HabitLogPayload | null;
};

export function HabitsPage() {
  const today = localDateFor(useCurrentTime('day'));
  const dates = recentCalendarDates(today, 7);
  const data = useLiveQuery(loadHabitDocuments, []) ?? {
    habits: [],
    logs: [],
  };
  const [undoChange, setUndoChange] = useState<UndoChange | null>(null);
  const activeHabits = data.habits.filter(({ payload }) => !payload.archivedAt);

  useEffect(() => {
    if (!undoChange) return;
    const timeoutId = window.setTimeout(() => setUndoChange(null), 6_000);
    return () => window.clearTimeout(timeoutId);
  }, [undoChange]);

  const changeCompletion = async (
    habitId: string,
    habitName: string,
    localDate: string,
    wasCompleted: boolean,
    previousLog: HabitLogPayload | null,
  ) => {
    await setHabitCompleted(habitId, localDate, !wasCompleted);
    setUndoChange({ habitId, habitName, localDate, previousLog });
  };

  const undo = async () => {
    if (!undoChange) return;
    await restoreHabitOccurrence(
      undoChange.habitId,
      undoChange.localDate,
      undoChange.previousLog,
    );
    setUndoChange(null);
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p>Recent rhythm</p>
          <h1>Habits</h1>
        </div>
        <Link to="/">Back to today</Link>
      </header>

      <div className={habitStyles.overviewHeading}>
        <p>
          The past seven days remain open for small corrections. Older entries
          stay as part of the record.
        </p>
        <Link to="/habits/manage">Manage habits</Link>
      </div>

      {activeHabits.length ? (
        <div className={habitStyles.weekList}>
          {activeHabits.map((habit) => {
            const logs = data.logs.filter(
              ({ payload }) => payload.habitId === habit.id,
            );

            return (
              <article key={habit.id} className={habitStyles.weekCard}>
                <Link
                  className={habitStyles.habitLink}
                  to={`/habits/${encodeURIComponent(habit.id)}`}
                >
                  <span>{habit.payload.name}</span>
                  <span aria-hidden="true">›</span>
                </Link>
                <div className={habitStyles.dayGrid}>
                  {dates.map((localDate) => {
                    const dateLabel = formatDay(localDate);
                    const status = habitOccurrenceStatus(
                      habit.payload,
                      logs.map(({ payload }) => payload),
                      localDate,
                      today,
                      startedOn(habit.createdAt),
                    );
                    const isCompleted = status === 'completed';
                    const isScheduled = status !== 'unscheduled';
                    const existingLog = logs.find(
                      ({ payload }) => payload.localDate === localDate,
                    );
                    const hasNote = Boolean(existingLog?.payload.reason);

                    return (
                      <div key={localDate} className={habitStyles.day}>
                        <span>{dateLabel.weekday}</span>
                        <Button
                          className={habitStyles.dayButton}
                          data-status={status}
                          aria-label={`${habit.payload.name}, ${dateLabel.weekday} ${dateLabel.day}: ${status}`}
                          aria-pressed={isCompleted}
                          isDisabled={!isScheduled}
                          onPress={() =>
                            void changeCompletion(
                              habit.id,
                              habit.payload.name,
                              localDate,
                              isCompleted,
                              existingLog?.payload ?? null,
                            )
                          }
                        >
                          {isCompleted
                            ? '✓'
                            : status === 'unscheduled'
                              ? '–'
                              : hasNote
                                ? '·'
                                : ''}
                        </Button>
                        <span data-today={localDate === today || undefined}>
                          {localDate === today ? 'Today' : dateLabel.day}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className={habitStyles.empty}>
          No active habits yet. <Link to="/habits/manage">Add one gently.</Link>
        </p>
      )}

      {undoChange ? (
        <div className={habitStyles.undo} role="status">
          <span>{undoChange.habitName} updated.</span>
          <Button onPress={() => void undo()}>Undo</Button>
          <Button
            aria-label="Dismiss update"
            onPress={() => setUndoChange(null)}
          >
            ×
          </Button>
        </div>
      ) : null}
    </section>
  );
}
