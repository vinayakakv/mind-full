import {
  type CheckInDocument,
  type CheckInKind,
  relevantCheckInKind,
} from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSetAtom } from 'jotai';
import { useState } from 'react';
import { Button } from 'react-aria-components';
import { useNavigate } from 'react-router';

import { CheckInFlow, openCheckIn } from '../components/CheckInFlow';
import { HabitList } from '../components/HabitList';
import { HealthCard } from '../components/HealthCard';
import { ReminderNotices } from '../components/ReminderNotices';
import { TaskList } from '../components/TaskList';
import { TaskSuggestions } from '../components/TaskSuggestions';
import { findCheckIn } from '../data/check-ins';
import { createJournal } from '../data/journals';
import { ensureSettings } from '../data/settings';
import { greetingFor, localDateFor, localTimeFor } from '../data/time';
import { useCurrentTime } from '../hooks/use-current-time';
import { activeCheckInIdAtom } from '../state/check-in';
import styles from './TodayPage.module.css';

const kindName = (kind: CheckInKind): string =>
  kind === 'morning' ? 'morning' : 'evening';

const checkInLabel = (
  kind: CheckInKind,
  checkIn: CheckInDocument | undefined,
): string => {
  if (!checkIn) {
    return `Begin ${kindName(kind)} check-in`;
  }

  return checkIn.payload.status === 'completed'
    ? `Review ${kindName(kind)} check-in`
    : `Continue ${kindName(kind)} check-in`;
};

function CheckInInvitation({
  kind,
  checkIn,
  isRelevant,
  onOpen,
}: {
  kind: CheckInKind;
  checkIn: CheckInDocument | undefined;
  isRelevant: boolean;
  onOpen: () => void;
}) {
  return (
    <Button
      className={`${styles.checkInButton} ${isRelevant ? '' : styles.secondaryCheckIn}`}
      onPress={onOpen}
    >
      <span className={styles.checkInState}>
        {checkIn?.payload.status === 'completed'
          ? 'Complete'
          : isRelevant
            ? 'Now · 2 min'
            : '2 min'}
      </span>
      <span>{checkInLabel(kind, checkIn)}</span>
      <span aria-hidden="true">→</span>
    </Button>
  );
}

function JournalComposeAction() {
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);

  const beginJournal = async () => {
    if (isCreating) return;
    setIsCreating(true);
    const journal = await createJournal();
    navigate(`/journal?entry=${encodeURIComponent(journal.id)}&mode=write`);
  };

  return (
    <Button
      className={styles.journalAction}
      aria-label="Write a journal entry"
      isDisabled={isCreating}
      onPress={beginJournal}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m5 19 3.7-.8L18.8 8.1a1.8 1.8 0 0 0 0-2.5l-.4-.4a1.8 1.8 0 0 0-2.5 0L5.8 15.3 5 19Z" />
        <path d="m14.8 6.3 2.9 2.9" />
      </svg>
      <span>{isCreating ? 'Opening…' : 'Write'}</span>
    </Button>
  );
}

export function TodayPage() {
  const navigate = useNavigate();
  const now = useCurrentTime('minute');
  const today = localDateFor(now);
  const settings = useLiveQuery(() => ensureSettings());
  const checkIns = useLiveQuery(
    async () => ({
      morning: await findCheckIn('morning', today),
      evening: await findCheckIn('evening', today),
    }),
    [today],
  );
  const setActiveCheckInId = useSetAtom(activeCheckInIdAtom);
  const relevantKind = relevantCheckInKind(
    localTimeFor(now),
    settings?.payload.morningStartsAt ?? '05:00',
    settings?.payload.eveningStartsAt ?? '18:00',
  );
  const otherKind = relevantKind === 'morning' ? 'evening' : 'morning';
  const openSelectedCheckIn = (
    kind: CheckInKind,
    checkIn: CheckInDocument | undefined,
  ) => {
    if (checkIn?.payload.status === 'completed') {
      navigate(`/check-ins/${encodeURIComponent(checkIn.id)}`, {
        state: { returnTo: 'today' },
      });
      return;
    }

    void openCheckIn(kind, setActiveCheckInId);
  };

  return (
    <>
      <section className={styles.intro}>
        <p className={styles.date}>
          {new Intl.DateTimeFormat(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          }).format(now)}
        </p>
        <h1>{greetingFor(now)}.</h1>
        <p className={styles.lede}>
          Begin with where you are, then choose what deserves your attention.
        </p>
        <div className={styles.checkIns}>
          <CheckInInvitation
            kind={relevantKind}
            checkIn={checkIns?.[relevantKind]}
            isRelevant
            onOpen={() =>
              openSelectedCheckIn(relevantKind, checkIns?.[relevantKind])
            }
          />
          <CheckInInvitation
            kind={otherKind}
            checkIn={checkIns?.[otherKind]}
            isRelevant={false}
            onOpen={() => openSelectedCheckIn(otherKind, checkIns?.[otherKind])}
          />
        </div>
      </section>
      <ReminderNotices />
      <HabitList />
      <TaskSuggestions />
      <TaskList />
      <HealthCard />
      <CheckInFlow />
      <JournalComposeAction />
    </>
  );
}
