import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Button } from 'react-aria-components';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router';

import { ActionDialog } from '../components/ui/ActionDialog';
import {
  initializeReflectionMemory,
  loadAiConfiguration,
  resetReflectionMemory,
} from '../data/ai';
import { loadReflectionData } from '../data/reflection';
import { hasPairingToken, synchronize } from '../data/sync';
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

const sourceLink = (
  source: Awaited<
    ReturnType<typeof loadReflectionData>
  >['latestSources'][number],
) =>
  source.type === 'journal'
    ? `/journal?entry=${encodeURIComponent(source.id)}`
    : `/check-ins/${encodeURIComponent(source.id)}`;

export function ReflectPage() {
  const reflection = useLiveQuery(loadReflectionData);
  const [status, setStatus] = useState<AiStatus>('not-configured');
  const [pendingJobs, setPendingJobs] = useState(0);
  const [failedJobs, setFailedJobs] = useState(0);
  const [action, setAction] = useState<'idle' | 'starting' | 'resetting'>(
    'idle',
  );
  const [isResetOpen, setIsResetOpen] = useState(false);
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
    setAction('starting');
    setError(null);
    try {
      await initializeReflectionMemory();
      setPendingJobs((count) => count + 1);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Memory could not begin.',
      );
    } finally {
      setAction('idle');
    }
  };

  const reset = async () => {
    setAction('resetting');
    setError(null);
    try {
      await resetReflectionMemory();
      setIsResetOpen(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Memory could not be reset.',
      );
    } finally {
      setAction('idle');
    }
  };

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

      {reflection?.memory ? (
        <article className={styles.memory}>
          <div className={styles.memoryHeading}>
            <div>
              <p className={styles.sectionLabel}>What Mindfull remembers</p>
              <p className={styles.updatedAt}>
                Last changed{' '}
                {new Date(
                  reflection.memory.payload.generatedAt,
                ).toLocaleString()}
              </p>
            </div>
            <Button
              className={styles.textButton}
              onPress={() => setIsResetOpen(true)}
            >
              Reset memory
            </Button>
          </div>
          <div className={styles.markdown}>
            <ReactMarkdown>{reflection.memory.payload.markdown}</ReactMarkdown>
          </div>
          {reflection.latestSources.length ? (
            <div className={styles.sources}>
              <span>Last changed after</span>
              {reflection.latestSources.map((source) => (
                <Link key={source.id} to={sourceLink(source)}>
                  {source.type === 'journal'
                    ? 'Journal'
                    : `${source.payload.kind} check-in`}
                  , {source.payload.localDate}
                </Link>
              ))}
            </div>
          ) : null}
        </article>
      ) : (
        <div className={styles.emptyMemory}>
          <p className={styles.sectionLabel}>What Mindfull remembers</p>
          <h2>A quiet memory can grow here.</h2>
          <p>
            Build it from the past year of journals and check-ins, or let it
            begin with future reflections.
          </p>
          <Button
            className={styles.primaryButton}
            onPress={initialize}
            isDisabled={
              action !== 'idle' ||
              pendingJobs > 0 ||
              status === 'not-configured'
            }
          >
            {action === 'starting' ? 'Beginning…' : 'Build from the past year'}
          </Button>
        </div>
      )}

      {reflection?.analyses.length ? (
        <section className={styles.insights}>
          <p className={styles.sectionLabel}>Recent reflections</p>
          {reflection.analyses.map((analysis) => (
            <article key={analysis.id} className={styles.analysis}>
              <p>{analysis.payload.summary}</p>
              {analysis.payload.themes.length ? (
                <p className={styles.themes}>
                  {analysis.payload.themes.join(' · ')}
                </p>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      {isResetOpen ? (
        <ActionDialog
          eyebrow="Reflection memory"
          title="Begin again?"
          onClose={() => setIsResetOpen(false)}
        >
          <p className={styles.dialogCopy}>
            This removes Mindfull’s current memory. Your journals, check-ins,
            and existing summaries remain unchanged.
          </p>
          <div className={styles.dialogActions}>
            <Button
              className={styles.textButton}
              onPress={() => setIsResetOpen(false)}
            >
              Keep memory
            </Button>
            <Button
              className={styles.dangerButton}
              onPress={reset}
              isDisabled={action !== 'idle'}
            >
              {action === 'resetting' ? 'Resetting…' : 'Reset memory'}
            </Button>
          </div>
        </ActionDialog>
      ) : null}
    </section>
  );
}
