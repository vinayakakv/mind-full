import type {
  CheckInDocument,
  JournalDocument,
  ReflectionMemorySections,
} from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Button } from 'react-aria-components';
import ReactMarkdown from 'react-markdown';
import { Link, useNavigate } from 'react-router';

import { ActionDialog } from '../components/ui/ActionDialog';
import { resetReflectionMemory } from '../data/ai';
import { loadReflectionData } from '../data/reflection';
import styles from './ReflectionMemoryPage.module.css';

const sectionLabels: Array<[keyof ReflectionMemorySections, string]> = [
  ['context', 'Context worth remembering'],
  ['supportivePatterns', 'Supportive patterns'],
  ['recurringThemes', 'Recurring themes'],
  ['ongoingCommitments', 'Ongoing commitments'],
  ['openQuestions', 'Open questions'],
  ['uncertainImpressions', 'Uncertain impressions'],
];

const sourceLink = (source: JournalDocument | CheckInDocument) =>
  source.type === 'journal'
    ? `/journal?entry=${encodeURIComponent(source.id)}`
    : `/check-ins/${encodeURIComponent(source.id)}`;

const sourceName = (source: JournalDocument | CheckInDocument) =>
  source.type === 'journal' ? 'Journal' : `${source.payload.kind} check-in`;

export function ReflectionMemoryPage() {
  const reflection = useLiveQuery(loadReflectionData);
  const navigate = useNavigate();
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const memory = reflection?.memory;

  const reset = async () => {
    setIsResetting(true);
    setError(null);
    try {
      await resetReflectionMemory();
      navigate('/reflect');
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Memory could not be reset.',
      );
      setIsResetting(false);
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p>What Mindfull remembers</p>
          <h1>Memory</h1>
        </div>
        <Link to="/reflect">Back to reflect</Link>
      </header>

      {memory ? (
        <>
          <div className={styles.meta}>
            <span>
              Last changed{' '}
              {new Date(memory.payload.generatedAt).toLocaleString()}
            </span>
            <Button
              className={styles.resetButton}
              onPress={() => setIsResetOpen(true)}
            >
              Reset memory
            </Button>
          </div>

          {memory.payload.sections ? (
            <div className={styles.sections}>
              {sectionLabels.map(([key, label]) => {
                const items = memory.payload.sections?.[key] ?? [];
                return items.length ? (
                  <section key={key}>
                    <h2>{label}</h2>
                    <ul>
                      {items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </section>
                ) : null;
              })}
            </div>
          ) : (
            <div className={styles.markdown}>
              <ReactMarkdown>{memory.payload.markdown}</ReactMarkdown>
            </div>
          )}

          {reflection.latestSources.length ? (
            <div className={styles.sources}>
              <span>Last changed after</span>
              {reflection.latestSources.map((source) => (
                <Link key={source.id} to={sourceLink(source)}>
                  {sourceName(source)}, {source.payload.localDate}
                </Link>
              ))}
            </div>
          ) : null}
        </>
      ) : reflection ? (
        <div className={styles.empty}>
          <h2>There is no memory to read yet.</h2>
          <Link to="/reflect">Return to Reflect</Link>
        </div>
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
            and current-week reflection remain unchanged.
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
              isDisabled={isResetting}
            >
              {isResetting ? 'Resetting…' : 'Reset memory'}
            </Button>
          </div>
        </ActionDialog>
      ) : null}
    </section>
  );
}
