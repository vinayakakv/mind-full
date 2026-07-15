import type {
  CheckInDocument,
  DomainDocument,
  JournalDocument,
  TaskSuggestionDocument,
} from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Button } from 'react-aria-components';
import { Link } from 'react-router';

import {
  acceptTaskSuggestion,
  documentTable,
  rejectTaskSuggestion,
} from '../data/documents';
import styles from './TaskSuggestions.module.css';

type SuggestionSource = JournalDocument | CheckInDocument;
type SuggestionWithSource = {
  suggestion: TaskSuggestionDocument;
  source: SuggestionSource | undefined;
};

const availableSuggestions = (
  documents: DomainDocument[],
  now: string,
): SuggestionWithSource[] => {
  const documentsById = new Map(
    documents.map((document) => [document.id, document]),
  );

  return documents
    .filter(
      (document): document is TaskSuggestionDocument =>
        document.type === 'task-suggestion' &&
        !document.deletedAt &&
        document.payload.state === 'pending' &&
        (!document.payload.availableFrom ||
          new Date(document.payload.availableFrom).getTime() <=
            new Date(now).getTime()),
    )
    .map((suggestion) => {
      const source = documentsById.get(suggestion.payload.sourceDocumentId);
      return {
        suggestion,
        source:
          source?.type === 'journal' || source?.type === 'check-in'
            ? source
            : undefined,
      };
    })
    .sort((left, right) =>
      left.suggestion.createdAt.localeCompare(right.suggestion.createdAt),
    );
};

const sourceLabel = (source: SuggestionSource | undefined): string => {
  if (source?.type === 'journal') return 'From a journal entry';
  if (source?.type === 'check-in') {
    const article = source.payload.kind === 'evening' ? 'an' : 'a';
    return `From ${article} ${source.payload.kind} check-in`;
  }
  return 'From a reflection';
};

function Source({ source }: { source: SuggestionSource | undefined }) {
  if (source?.type === 'journal') {
    return (
      <Link to={`/journal?entry=${encodeURIComponent(source.id)}`}>
        {sourceLabel(source)}
      </Link>
    );
  }

  return <span>{sourceLabel(source)}</span>;
}

export function TaskSuggestions() {
  const documents = useLiveQuery(() => documentTable().toArray(), []);
  const [now, setNow] = useState(() => new Date().toISOString());
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const suggestions = documents
    ? availableSuggestions(documents, now)
    : undefined;

  useEffect(() => {
    const refresh = window.setInterval(
      () => setNow(new Date().toISOString()),
      60_000,
    );
    return () => window.clearInterval(refresh);
  }, []);

  if (!suggestions?.length) return null;

  const resolve = async (suggestionId: string, action: 'accept' | 'reject') => {
    if (resolvingId) return;
    setResolvingId(suggestionId);
    try {
      if (action === 'accept') await acceptTaskSuggestion(suggestionId);
      else await rejectTaskSuggestion(suggestionId);
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <section className={styles.section} aria-labelledby="suggestions-heading">
      <header>
        <p>Offered, never assumed</p>
        <h2 id="suggestions-heading">Suggestions</h2>
      </header>
      <ul className={styles.list}>
        {suggestions.map(({ suggestion, source }) => {
          const isResolving = resolvingId === suggestion.id;
          return (
            <li key={suggestion.id} className={styles.suggestion}>
              <div>
                <p className={styles.proposedText}>
                  {suggestion.payload.proposedText}
                </p>
                <p className={styles.source}>
                  <Source source={source} /> · Suggested by Mindfull
                </p>
              </div>
              <div className={styles.actions}>
                <Button
                  className={styles.accept}
                  isDisabled={Boolean(resolvingId)}
                  onPress={() => resolve(suggestion.id, 'accept')}
                >
                  {isResolving ? 'Saving…' : 'Add task'}
                </Button>
                <Button
                  className={styles.reject}
                  isDisabled={Boolean(resolvingId)}
                  onPress={() => resolve(suggestion.id, 'reject')}
                >
                  Dismiss
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
