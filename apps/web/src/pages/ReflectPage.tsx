import type { CheckInDocument, JournalDocument } from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Button } from 'react-aria-components';
import { Link } from 'react-router';

import { initializeReflectionMemory, loadAiConfiguration } from '../data/ai';
import { rejectHabitSuggestion } from '../data/habits';
import { loadReflectionData } from '../data/reflection';
import { hasPairingToken, synchronize } from '../data/sync';
import { acceptTaskSuggestion, rejectTaskSuggestion } from '../data/tasks';
import type { AiStatus } from '../state/ai';
import styles from './ReflectPage.module.css';

const statusText: Record<AiStatus, string> = {
  'not-configured':
    'Connect a reflection model in Settings when you are ready.',
  checking: 'Checking in with the reflection model…',
  available: 'The reflection model is ready.',
  unavailable: 'The reflection model is resting. Waiting work is safe.',
  'invalid-configuration': 'The reflection model needs attention in Settings.',
  paused: 'Reflection is paused.',
};

type ReflectionSource = JournalDocument | CheckInDocument;

const sourceLink = (source: ReflectionSource) =>
  source.type === 'journal'
    ? `/journal?entry=${encodeURIComponent(source.id)}`
    : `/check-ins/${encodeURIComponent(source.id)}`;

const sourceLabel = (source: ReflectionSource | undefined): string => {
  if (source?.type === 'journal') return 'From a journal entry';
  if (source?.type === 'check-in') {
    const article = source.payload.kind === 'evening' ? 'an' : 'a';
    return `From ${article} ${source.payload.kind} check-in`;
  }
  return 'From a reflection';
};

function SuggestionSource({
  source,
}: {
  source: ReflectionSource | undefined;
}) {
  return source ? (
    <Link to={sourceLink(source)}>{sourceLabel(source)}</Link>
  ) : (
    <span>{sourceLabel(source)}</span>
  );
}

const formatWeek = (start: string, end: string): string => {
  const formatter = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
  });
  return `${formatter.format(new Date(`${start}T12:00:00`))} – ${formatter.format(
    new Date(`${end}T12:00:00`),
  )}`;
};

const memoryPreview = (
  memory: NonNullable<Awaited<ReturnType<typeof loadReflectionData>>['memory']>,
): string[] => {
  const sections = memory.payload.sections;
  if (sections) {
    return [...sections.supportivePatterns, ...sections.recurringThemes].slice(
      0,
      3,
    );
  }

  const plainText = memory.payload.markdown
    .replace(/^#+\s*/gm, '')
    .replace(/[\n*_`>-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plainText ? [plainText.slice(0, 260)] : [];
};

export function ReflectPage() {
  const reflection = useLiveQuery(loadReflectionData);
  const [status, setStatus] = useState<AiStatus>('not-configured');
  const [pendingJobs, setPendingJobs] = useState(0);
  const [failedJobs, setFailedJobs] = useState(0);
  const [isStarting, setIsStarting] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasPairingToken()) return;
    const refresh = async () => {
      try {
        const configuration = await loadAiConfiguration();
        setStatus(configuration.status);
        setPendingJobs(configuration.pendingJobs);
        setFailedJobs(configuration.failedJobs);
        if (configuration.pendingJobs === 0) await synchronize();
      } catch {
        // Reflect remains readable while the backend is unavailable.
      }
    };
    const interval = window.setInterval(() => void refresh(), 15_000);
    void refresh();
    return () => window.clearInterval(interval);
  }, []);

  const initialize = async () => {
    setIsStarting(true);
    setError(null);
    try {
      await initializeReflectionMemory();
      setPendingJobs((count) => count + 1);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Memory could not begin.',
      );
    } finally {
      setIsStarting(false);
    }
  };

  const resolveTask = async (
    suggestionId: string,
    action: 'accept' | 'reject',
  ) => {
    if (resolvingId) return;
    setResolvingId(suggestionId);
    try {
      if (action === 'accept') await acceptTaskSuggestion(suggestionId);
      else await rejectTaskSuggestion(suggestionId);
    } finally {
      setResolvingId(null);
    }
  };

  const dismissHabit = async (suggestionId: string) => {
    if (resolvingId) return;
    setResolvingId(suggestionId);
    try {
      await rejectHabitSuggestion(suggestionId);
    } finally {
      setResolvingId(null);
    }
  };

  const memory = reflection?.memory;
  const week = reflection?.currentWeek;
  const weekSections = week?.payload.sections;
  const questions = weekSections?.questionsToCarry ?? [];

  return (
    <section className={styles.page}>
      <p className={styles.eyebrow}>Look back gently</p>
      <h1>Reflect</h1>
      <p className={styles.status} data-status={status}>
        {failedJobs
          ? 'Some reflection work could not be completed. You can retry it in Settings.'
          : pendingJobs
            ? `Reflecting on ${pendingJobs} waiting ${pendingJobs === 1 ? 'entry' : 'entries'}.`
            : statusText[status]}
      </p>

      <div className={styles.space}>
        {reflection?.taskSuggestions.length ? (
          <article className={styles.card}>
            <p className={styles.sectionLabel}>Suggested tasks</p>
            <ul className={styles.suggestions}>
              {reflection.taskSuggestions.map(({ suggestion, source }) => (
                <li key={suggestion.id}>
                  <div>
                    <p className={styles.suggestionName}>
                      {suggestion.payload.proposedText}
                    </p>
                    <p className={styles.suggestionSource}>
                      <SuggestionSource source={source} /> · Suggested by
                      Mindfull
                    </p>
                  </div>
                  <div className={styles.actions}>
                    <Button
                      className={styles.acceptButton}
                      isDisabled={Boolean(resolvingId)}
                      onPress={() => void resolveTask(suggestion.id, 'accept')}
                    >
                      {resolvingId === suggestion.id ? 'Saving…' : 'Add task'}
                    </Button>
                    <Button
                      className={styles.textButton}
                      isDisabled={Boolean(resolvingId)}
                      onPress={() => void resolveTask(suggestion.id, 'reject')}
                    >
                      Dismiss
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        ) : null}

        {reflection?.habitSuggestions.length ? (
          <article className={styles.card}>
            <p className={styles.sectionLabel}>Suggested habits</p>
            <ul className={styles.suggestions}>
              {reflection.habitSuggestions.map(({ suggestion, source }) => (
                <li key={suggestion.id}>
                  <div>
                    <p className={styles.suggestionName}>
                      {suggestion.payload.proposedName}
                    </p>
                    <p className={styles.suggestionReason}>
                      {suggestion.payload.reason}
                    </p>
                    <p className={styles.suggestionSource}>
                      <SuggestionSource source={source} /> · Suggested by
                      Mindfull
                    </p>
                  </div>
                  <div className={styles.actions}>
                    <Link
                      className={styles.acceptButton}
                      to={`/habits?suggestion=${encodeURIComponent(suggestion.id)}`}
                    >
                      Set up habit
                    </Link>
                    <Button
                      className={styles.textButton}
                      isDisabled={Boolean(resolvingId)}
                      onPress={() => void dismissHabit(suggestion.id)}
                    >
                      {resolvingId === suggestion.id
                        ? 'Dismissing…'
                        : 'Dismiss'}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        ) : null}

        {week && weekSections ? (
          <article className={`${styles.card} ${styles.weekCard}`}>
            <div className={styles.cardHeading}>
              <p className={styles.sectionLabel}>This week</p>
              <p className={styles.updatedAt}>
                {formatWeek(week.payload.weekStart, week.payload.weekEnd)}
              </p>
            </div>
            <p className={styles.weekSummary}>{weekSections.summary}</p>
            <div className={styles.weekColumns}>
              {weekSections.brightSpots.length ? (
                <section>
                  <h2>Bright spots</h2>
                  <ul>
                    {weekSections.brightSpots.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {weekSections.difficultParts.length ? (
                <section>
                  <h2>Hard parts</h2>
                  <ul>
                    {weekSections.difficultParts.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {weekSections.supportiveActions.length ? (
                <section>
                  <h2>What may help</h2>
                  <ul>
                    {weekSections.supportiveActions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          </article>
        ) : null}

        {questions.length ? (
          <article className={styles.card}>
            <p className={styles.sectionLabel}>Questions to carry</p>
            <ul className={styles.questionList}>
              {questions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ) : null}

        {memory ? (
          <article className={`${styles.card} ${styles.memoryCard}`}>
            <div className={styles.cardHeading}>
              <div>
                <p className={styles.sectionLabel}>Long-term memory</p>
                <p className={styles.updatedAt}>
                  Last changed{' '}
                  {new Date(memory.payload.generatedAt).toLocaleString()}
                </p>
              </div>
              <Link className={styles.cardAction} to="/reflect/memory">
                Read memory
              </Link>
            </div>
            <ul className={styles.memoryPreview}>
              {memoryPreview(memory).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ) : (
          <article className={`${styles.card} ${styles.emptyMemory}`}>
            <p className={styles.sectionLabel}>Long-term memory</p>
            <h2>A quiet memory can grow here.</h2>
            <p>
              Build it from the past year of journals and check-ins, or let it
              begin with future reflections.
            </p>
            <Button
              className={styles.primaryButton}
              onPress={initialize}
              isDisabled={
                isStarting || pendingJobs > 0 || status === 'not-configured'
              }
            >
              {isStarting ? 'Beginning…' : 'Build from the past year'}
            </Button>
          </article>
        )}
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
    </section>
  );
}
