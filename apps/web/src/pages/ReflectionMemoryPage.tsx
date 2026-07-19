import type {
  CheckInDocument,
  JournalDocument,
  ReflectionMemorySections,
} from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router';

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
  const memory = reflection?.memory;
  const wasBuiltFromManySources =
    (memory?.payload.updatedFromDocumentIds.length ?? 0) > 1;

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

          {wasBuiltFromManySources || reflection.latestSources.length ? (
            <div className={styles.sources}>
              {wasBuiltFromManySources ? (
                <span>
                  Built from journals and check-ins across the past year.
                </span>
              ) : (
                <>
                  <span>Last changed after</span>
                  {reflection.latestSources.map((source) => (
                    <Link key={source.id} to={sourceLink(source)}>
                      {sourceName(source)}, {source.payload.localDate}
                    </Link>
                  ))}
                </>
              )}
            </div>
          ) : null}
        </>
      ) : reflection ? (
        <div className={styles.empty}>
          <h2>There is no memory to read yet.</h2>
          <Link to="/reflect">Return to Reflect</Link>
        </div>
      ) : null}
    </section>
  );
}
