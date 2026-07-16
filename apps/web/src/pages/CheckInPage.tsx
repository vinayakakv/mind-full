import type { CheckInDocument, CheckInKind } from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Button } from 'react-aria-components';
import ReactMarkdown from 'react-markdown';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

import { deleteCheckIn, documentTable } from '../data/documents';
import { localDateFor } from '../data/time';
import styles from './CheckInPage.module.css';

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

const observationsFrom = (
  checkIn: CheckInDocument,
): Array<{ label: string; value: string }> =>
  [
    checkIn.payload.kind === 'morning'
      ? { label: 'Energy', value: checkIn.payload.energy }
      : { label: 'Stress', value: checkIn.payload.stress },
    { label: 'Mood', value: checkIn.payload.mood },
    {
      label: 'Emotions',
      value: checkIn.payload.emotions.length
        ? checkIn.payload.emotions.join(' · ')
        : null,
    },
  ].filter(
    (observation): observation is { label: string; value: string } =>
      observation.value !== null,
  );

export const checkInPageHeading = (
  kind: CheckInKind,
  localDate: string,
  today: string,
): string => {
  const period = kind === 'morning' ? 'morning' : 'evening';
  if (localDate === today) return `This ${period}`;
  return kind === 'morning' ? 'Morning check-in' : 'Evening check-in';
};

export function CheckInPage() {
  const { checkInId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const checkIn = useLiveQuery(async () => {
    if (!checkInId) return null;
    const document = await documentTable().get(checkInId);
    return document?.type === 'check-in' && !document.deletedAt
      ? document
      : null;
  }, [checkInId]);
  const returnsToToday = location.state?.returnTo === 'today';
  const returnPath = returnsToToday ? '/' : '/history';
  const returnLabel = returnsToToday ? 'Back to today' : 'Back to history';

  if (checkIn === undefined) {
    return <p className={styles.loading}>Gathering this check-in…</p>;
  }

  if (checkIn?.payload.status !== 'completed') {
    return (
      <section className={styles.unavailable}>
        <p>This check-in is not part of your history yet.</p>
        <Link to={returnPath}>{returnLabel}</Link>
      </section>
    );
  }

  const isMorning = checkIn.payload.kind === 'morning';
  const heading = checkInPageHeading(
    checkIn.payload.kind,
    checkIn.payload.localDate,
    localDateFor(new Date()),
  );
  const observations = observationsFrom(checkIn);
  const answers = checkIn.payload.responses.filter(
    (response) => !response.skipped && response.answer,
  );
  const hasSummary =
    observations.length > 0 ||
    answers.length > 0 ||
    Boolean(checkIn.payload.reflectionMarkdown);

  const deleteEntry = async () => {
    await deleteCheckIn(checkIn.id);
    navigate(returnPath, { replace: true });
  };

  return (
    <article className={styles.page}>
      <header className={styles.header}>
        <div className={styles.meta}>
          <p>{formatLocalDate(checkIn.payload.localDate)}</p>
          <Link to={returnPath}>{returnLabel}</Link>
        </div>
        <p className={styles.eyebrow}>What you noticed</p>
        <h1>{heading}</h1>
        <p className={styles.introduction}>
          {isMorning
            ? 'A small record of how the day began.'
            : 'A small record of how the day came to rest.'}
        </p>
      </header>

      {observations.length ? (
        <dl className={styles.facts}>
          {observations.map(({ label, value }) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {answers.map((response) => (
        <section className={styles.answer} key={response.promptId}>
          <h2>{response.promptText}</h2>
          {response.source === 'ai' ? (
            <p className={styles.aiLabel}>Asked by Mindfull</p>
          ) : null}
          <p>{response.answer}</p>
        </section>
      ))}

      {checkIn.payload.reflectionMarkdown ? (
        <section className={styles.answer}>
          <h2>Reflection</h2>
          <div className={styles.markdown}>
            <ReactMarkdown>{checkIn.payload.reflectionMarkdown}</ReactMarkdown>
          </div>
        </section>
      ) : null}

      {!hasSummary ? (
        <p className={styles.empty}>Nothing needed words this time.</p>
      ) : null}

      <footer className={styles.actions}>
        {isConfirmingDelete ? (
          <div className={styles.confirmDelete}>
            <span>Delete this check-in?</span>
            <Button className={styles.deleteButton} onPress={deleteEntry}>
              Delete
            </Button>
            <Button
              className={styles.textButton}
              onPress={() => setIsConfirmingDelete(false)}
            >
              Keep it
            </Button>
          </div>
        ) : (
          <Button
            className={styles.textButton}
            onPress={() => setIsConfirmingDelete(true)}
          >
            Delete check-in
          </Button>
        )}
      </footer>
    </article>
  );
}
