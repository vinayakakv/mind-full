import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from 'react-aria-components';

import {
  dismissActiveReminder,
  loadReminderNotices,
} from '../data/notifications';
import styles from './ReminderNotices.module.css';

export function ReminderNotices() {
  const notices = useLiveQuery(loadReminderNotices, []);
  if (!notices?.length) return null;

  return (
    <section className={styles.notices} aria-label="Reminders">
      {notices.map(({ reminder, text }) => (
        <div className={styles.notice} key={reminder.id}>
          <div className={styles.copy}>
            <p>Gentle reminder</p>
            <span>{text}</span>
          </div>
          <Button
            className={styles.dismiss}
            onPress={() => dismissActiveReminder(reminder.id)}
          >
            Dismiss
          </Button>
        </div>
      ))}
    </section>
  );
}
