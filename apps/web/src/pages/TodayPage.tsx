import {
  type CheckInDocument,
  type CheckInKind,
  relevantCheckInKind,
} from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSetAtom } from 'jotai';
import { Button } from 'react-aria-components';

import { CheckInFlow, openCheckIn } from '../components/CheckInFlow';
import { HabitList } from '../components/HabitList';
import { TaskList } from '../components/TaskList';
import { ensureSettings, findCheckIn } from '../data/documents';
import { greetingFor, localDateFor, localTimeFor } from '../data/time';
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

export function TodayPage() {
  const now = new Date();
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
        <div className={styles.checkIns}>
          <CheckInInvitation
            kind={relevantKind}
            checkIn={checkIns?.[relevantKind]}
            isRelevant
            onOpen={() => openCheckIn(relevantKind, setActiveCheckInId)}
          />
          <CheckInInvitation
            kind={otherKind}
            checkIn={checkIns?.[otherKind]}
            isRelevant={false}
            onOpen={() => openCheckIn(otherKind, setActiveCheckInId)}
          />
        </div>
      </section>
      <HabitList />
      <TaskList />
      <CheckInFlow />
    </>
  );
}
