import type { CheckInDocument, JournalDocument } from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Button } from 'react-aria-components';
import { Link } from 'react-router';

import { ActionDialog } from '../components/ui/ActionDialog';
import {
  type AiConfigurationView,
  loadAiConfiguration,
  rebuildReflections,
} from '../data/ai';
import { rejectHabitSuggestion } from '../data/habits';
import { loadReflectionData } from '../data/reflection';
import { hasPairingToken, synchronize } from '../data/sync';
import { acceptTaskSuggestion, rejectTaskSuggestion } from '../data/tasks';
import type { AiStatus } from '../state/ai';
import styles from './ReflectPage.module.css';

type ReflectionRebuild = AiConfigurationView['reflectionRebuild'];

const statusText: Record<AiStatus, string> = {
  'not-configured':
    'Connect a reflection model in Settings when you are ready.',
  checking: 'Checking in with the reflection model…',
  available: 'The reflection model is ready.',
  unavailable: 'The reflection model is resting. Waiting work is safe.',
  'invalid-configuration': 'The reflection model needs attention in Settings.',
  paused: 'Reflection is paused.',
};

const rebuildProgressText = (
  progress: NonNullable<ReflectionRebuild>,
  status: AiStatus,
): string => {
  const subject = progress.phase === 'memory' ? 'past' : 'this week’s';
  const amount = `${progress.processedSources} of ${progress.totalSources} ${subject} ${progress.totalSources === 1 ? 'reflection' : 'reflections'} processed`;
  const name = progress.phase === 'memory' ? 'Memory' : 'This week';
  if (progress.state === 'running') {
    return `Rebuilding ${name.toLocaleLowerCase()} · processing a batch · ${amount}.`;
  }
  if (progress.state === 'failed') {
    return `The reflection rebuild needs attention · ${amount}.`;
  }
  if (status === 'unavailable') {
    return `Reflection rebuild waiting for the model · ${amount}.`;
  }
  if (status === 'paused') {
    return `Reflection rebuild paused · ${amount}.`;
  }
  return `Rebuilding ${name.toLocaleLowerCase()} · ${amount}.`;
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
  const [reflectionRebuild, setReflectionRebuild] =
    useState<ReflectionRebuild>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isRebuildOpen, setIsRebuildOpen] = useState(false);
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
        setReflectionRebuild(configuration.reflectionRebuild);
        if (configuration.pendingJobs === 0) await synchronize();
      } catch {
        // Reflect remains readable while the backend is unavailable.
      }
    };
    const interval = window.setInterval(() => void refresh(), 15_000);
    void refresh();
    return () => window.clearInterval(interval);
  }, []);

  const rebuild = async () => {
    setIsStarting(true);
    setError(null);
    try {
      await rebuildReflections();
      setPendingJobs((count) => count + 1);
      setIsRebuildOpen(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Reflections could not be rebuilt.',
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
  const weekSourceCount = new Set(week?.payload.updatedFromDocumentIds ?? [])
    .size;
  const weekLabel =
    weekSourceCount <= 2 ? 'Beginning this week' : 'This week so far';
  const questions = weekSections?.questionsToCarry ?? [];
  const hasGeneratedReflections = Boolean(
    memory ||
      week ||
      reflection?.taskSuggestions.length ||
      reflection?.habitSuggestions.length,
  );

  return (
    <section className={styles.page}>
      <p className={styles.eyebrow}>Look back gently</p>
      <h1>Reflect</h1>
      <div className={styles.introMeta}>
        <p className={styles.status} data-status={status}>
          {failedJobs
            ? 'Some reflection work could not be completed. You can retry it in Settings.'
            : reflectionRebuild
              ? rebuildProgressText(reflectionRebuild, status)
              : pendingJobs
                ? `Reflecting on ${pendingJobs} waiting ${pendingJobs === 1 ? 'entry' : 'entries'}.`
                : statusText[status]}
        </p>
        <Link className={styles.historyLink} to="/history">
          View history →
        </Link>
      </div>

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
                      to={`/habits/manage?suggestion=${encodeURIComponent(suggestion.id)}`}
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
              <p className={styles.sectionLabel}>{weekLabel}</p>
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
              onPress={() => void rebuild()}
              isDisabled={
                isStarting ||
                Boolean(reflectionRebuild) ||
                pendingJobs > 0 ||
                status === 'not-configured'
              }
            >
              {isStarting ? 'Beginning…' : 'Build from the past year'}
            </Button>
          </article>
        )}

        {hasGeneratedReflections ? (
          <div className={styles.rebuildArea}>
            <Button
              className={styles.rebuildButton}
              onPress={() => setIsRebuildOpen(true)}
              isDisabled={Boolean(reflectionRebuild) || isStarting}
            >
              Reset and rebuild reflections
            </Button>
            <p>
              Begin again from the past year and rebuild this week with the
              selected model.
            </p>
          </div>
        ) : null}
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {isRebuildOpen ? (
        <ActionDialog
          eyebrow="Reflection"
          title="Begin again?"
          onClose={() => setIsRebuildOpen(false)}
        >
          <p className={styles.dialogCopy}>
            Mindfull will clear its long-term memory, this week’s reflection,
            and pending suggestions. Your journals, check-ins, tasks, habits,
            and earlier decisions remain unchanged.
          </p>
          <div className={styles.dialogActions}>
            <Button
              className={styles.textButton}
              onPress={() => setIsRebuildOpen(false)}
            >
              Keep reflections
            </Button>
            <Button
              className={styles.primaryButton}
              onPress={() => void rebuild()}
              isDisabled={isStarting}
            >
              {isStarting ? 'Beginning…' : 'Reset and rebuild'}
            </Button>
          </div>
        </ActionDialog>
      ) : null}
    </section>
  );
}
