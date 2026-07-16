import { scheduledOn } from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from 'react-aria-components';
import { Link } from 'react-router';

import { loadHabitDocuments, setHabitCompleted } from '../data/habits';
import { localDateFor } from '../data/time';
import { useCurrentTime } from '../hooks/use-current-time';
import styles from './HabitList.module.css';

const formatReminder = (reminderTime: string): string => {
  const [hour, minute] = reminderTime.split(':').map(Number);
  const date = new Date(2000, 0, 1, hour, minute);
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

export function HabitList() {
  const data = useLiveQuery(loadHabitDocuments, []) ?? { habits: [], logs: [] };
  const today = localDateFor(useCurrentTime('day'));
  const activeHabits = data.habits.filter(({ payload }) => !payload.archivedAt);
  const todaysHabits = activeHabits.filter(({ payload }) =>
    scheduledOn(payload.weekdays, today),
  );
  const completedHabitIds = new Set(
    data.logs
      .filter(
        ({ payload }) =>
          payload.localDate === today && payload.outcome === 'completed',
      )
      .map(({ payload }) => payload.habitId),
  );

  return (
    <section className={styles.section} aria-labelledby="today-habits">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>A gentle rhythm</p>
          <h2 id="today-habits">Today’s habits</h2>
        </div>
        <Link className={styles.manageButton} to="/habits">
          Manage
        </Link>
      </div>
      {todaysHabits.length === 0 ? (
        <p className={styles.emptyToday}>
          {activeHabits.length === 0
            ? 'No habits yet. Begin with something kind and small.'
            : 'Nothing is scheduled for today.'}
        </p>
      ) : (
        <div className={styles.todayList}>
          {todaysHabits.map((habit) => {
            const isCompleted = completedHabitIds.has(habit.id);

            return (
              <Button
                key={habit.id}
                className={styles.todayHabit}
                aria-pressed={isCompleted}
                onPress={() => setHabitCompleted(habit.id, today, !isCompleted)}
              >
                <span className={styles.completionMark} aria-hidden="true">
                  {isCompleted ? '✓' : ''}
                </span>
                <span className={styles.habitName}>{habit.payload.name}</span>
                {habit.payload.reminderTime ? (
                  <span className={styles.reminderTime}>
                    {formatReminder(habit.payload.reminderTime)}
                  </span>
                ) : null}
              </Button>
            );
          })}
        </div>
      )}
    </section>
  );
}
