import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router';

import { HabitManagement } from '../components/HabitList';
import { loadHabitDocuments } from '../data/habits';
import { localDateFor } from '../data/time';
import styles from './HabitsPage.module.css';

export function HabitsPage() {
  const data = useLiveQuery(loadHabitDocuments, []) ?? {
    habits: [],
    logs: [],
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p>Daily rhythm</p>
          <h1>Habits</h1>
        </div>
        <Link to="/">Back to today</Link>
      </header>
      <HabitManagement
        habits={data.habits}
        logs={data.logs}
        today={localDateFor(new Date())}
      />
    </section>
  );
}
