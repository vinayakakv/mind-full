import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useSearchParams } from 'react-router';

import { HabitManagement } from '../components/HabitManagement';
import { loadHabitDocuments, loadPendingHabitSuggestion } from '../data/habits';
import { localDateFor } from '../data/time';
import { useCurrentTime } from '../hooks/use-current-time';
import styles from './HabitsPage.module.css';

export function HabitManagementPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const suggestionId = searchParams.get('suggestion');
  const editingHabitId = searchParams.get('edit');
  const today = localDateFor(useCurrentTime('day'));
  const data = useLiveQuery(loadHabitDocuments, []) ?? {
    habits: [],
    logs: [],
  };
  const suggestion = useLiveQuery(
    () =>
      suggestionId
        ? loadPendingHabitSuggestion(suggestionId).then(
            (result) => result ?? null,
          )
        : Promise.resolve(null),
    [suggestionId],
  );

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p>{suggestionId ? 'Offered, never assumed' : 'Shape the rhythm'}</p>
          <h1>{suggestionId ? 'Set up a habit' : 'Manage habits'}</h1>
        </div>
        <Link to={suggestionId ? '/reflect' : '/habits'}>
          {suggestionId ? 'Back to reflect' : 'Back to habits'}
        </Link>
      </header>
      {suggestionId && suggestion === undefined ? null : suggestionId &&
        !suggestion ? (
        <p className={styles.unavailable}>
          This suggestion is no longer waiting.{' '}
          <Link to="/reflect">Return to Reflect</Link>
        </p>
      ) : (
        <HabitManagement
          key={suggestion?.id ?? 'habit-management'}
          habits={data.habits}
          logs={data.logs}
          today={today}
          {...(editingHabitId
            ? { initialHabitId: editingHabitId, initiallyEditing: true }
            : {})}
          {...(suggestion ? { suggestion } : {})}
          onLeaveSuggestion={() => navigate('/reflect')}
        />
      )}
    </section>
  );
}
