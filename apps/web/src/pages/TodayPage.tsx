import type { CheckInDocument } from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSetAtom } from 'jotai';
import { Button } from 'react-aria-components';

import {
  MorningCheckIn,
  openMorningCheckIn,
} from '../components/MorningCheckIn';
import { TaskList } from '../components/TaskList';
import { findMorningCheckIn } from '../data/documents';
import { greetingFor, localDateFor } from '../data/time';
import { activeCheckInIdAtom } from '../state/check-in';
import styles from './TodayPage.module.css';

const checkInLabel = (checkIn: CheckInDocument | undefined): string => {
  if (!checkIn) {
    return 'Begin morning check-in';
  }

  return checkIn.payload.status === 'completed'
    ? 'Review morning check-in'
    : 'Continue morning check-in';
};

export function TodayPage() {
  const today = localDateFor(new Date());
  const morningCheckIn = useLiveQuery(() => findMorningCheckIn(today), [today]);
  const setActiveCheckInId = useSetAtom(activeCheckInIdAtom);

  return (
    <>
      <section className={styles.intro}>
        <p className={styles.date}>
          {new Intl.DateTimeFormat(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          }).format(new Date())}
        </p>
        <h1>{greetingFor(new Date())}.</h1>
        <p className={styles.lede}>
          Begin with where you are, then choose what deserves your attention.
        </p>
        <Button
          className={styles.checkInButton}
          onPress={() => openMorningCheckIn(setActiveCheckInId)}
        >
          <span className={styles.checkInState}>
            {morningCheckIn?.payload.status === 'completed'
              ? 'Complete'
              : '2 min'}
          </span>
          <span>{checkInLabel(morningCheckIn)}</span>
          <span aria-hidden="true">→</span>
        </Button>
      </section>
      <TaskList />
      <MorningCheckIn />
    </>
  );
}
