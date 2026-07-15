import type { ReminderDocument } from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from 'react-aria-components';

import { database, type LocalNotificationState } from '../data/database';
import { dismissActiveReminder } from '../data/notifications';
import styles from './ReminderNotices.module.css';

type ReminderNotice = {
  reminder: ReminderDocument;
  state: LocalNotificationState;
  text: string;
};

const noticeText = async (reminder: ReminderDocument): Promise<string> => {
  const target = await database.documents.get(reminder.payload.targetId);
  if (target?.type === 'habit') return target.payload.name;
  if (target?.type === 'task') return target.payload.text;
  return reminder.payload.targetId === 'evening'
    ? 'Evening check-in'
    : 'Morning check-in';
};

const loadNotices = async (): Promise<ReminderNotice[]> => {
  const states = await database.notificationState
    .filter(({ activeStatus }) => activeStatus !== null)
    .toArray();

  const notices = await Promise.all(
    states.map(async (state) => {
      const document = await database.documents.get(state.reminderId);
      if (document?.type !== 'reminder' || document.deletedAt) return null;
      return {
        reminder: document,
        state,
        text: await noticeText(document),
      };
    }),
  );

  return notices.filter((notice): notice is ReminderNotice => notice !== null);
};

export function ReminderNotices() {
  const notices = useLiveQuery(loadNotices, []);
  if (!notices?.length) return null;

  return (
    <section className={styles.notices} aria-label="Reminders">
      {notices.map(({ reminder, text }) => (
        <div className={styles.notice} key={reminder.id}>
          <div>
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
