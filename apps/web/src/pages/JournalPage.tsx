import {
  type JournalDocument,
  type JournalPayload,
  journalBody,
  journalHeading,
} from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  Input,
  Label,
  TextArea,
  TextField,
} from 'react-aria-components';
import ReactMarkdown from 'react-markdown';
import { Link, useNavigate, useSearchParams } from 'react-router';

import {
  completeJournal,
  createJournal,
  deleteJournal,
  loadJournal,
  updateJournal,
} from '../data/journals';
import styles from './JournalPage.module.css';

const formatLocalDate = (localDate: string, style: 'long' | 'short'): string =>
  new Intl.DateTimeFormat(undefined, {
    weekday: style === 'long' ? 'long' : undefined,
    day: 'numeric',
    month: style === 'long' ? 'long' : 'short',
    year:
      new Date().getFullYear().toString() === localDate.slice(0, 4)
        ? undefined
        : 'numeric',
  }).format(new Date(`${localDate}T12:00:00`));

const entryHeading = (journal: JournalDocument): string =>
  journalHeading(
    journal.payload,
    formatLocalDate(journal.payload.localDate, 'long'),
  );

type JournalDraft = Pick<JournalPayload, 'title' | 'markdown'>;

function JournalEditor({
  journal,
  onDone,
}: {
  journal: JournalDocument;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(journal.payload.title ?? '');
  const [markdown, setMarkdown] = useState(journal.payload.markdown);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>(
    'saved',
  );
  const latestDraft = useRef<JournalDraft>({
    title: journal.payload.title,
    markdown: journal.payload.markdown,
  });
  const lastSaved = useRef(latestDraft.current);
  const saveQueue = useRef(Promise.resolve());

  latestDraft.current = { title: title.trim() || null, markdown };

  const persist = useCallback(
    async (draft = latestDraft.current): Promise<boolean> => {
      if (
        draft.title === lastSaved.current.title &&
        draft.markdown === lastSaved.current.markdown
      ) {
        return true;
      }

      setSaveState('saving');
      saveQueue.current = saveQueue.current
        .catch(() => undefined)
        .then(async () => {
          await updateJournal(journal.id, draft);
          lastSaved.current = draft;
        });

      try {
        await saveQueue.current;
        setSaveState('saved');
        return true;
      } catch {
        setSaveState('error');
        return false;
      }
    },
    [journal.id],
  );

  useEffect(() => {
    const draft = { title: title.trim() || null, markdown };
    const timeout = window.setTimeout(() => void persist(draft), 400);
    return () => window.clearTimeout(timeout);
  }, [title, markdown, persist]);

  useEffect(
    () => () => {
      void persist(latestDraft.current);
    },
    [persist],
  );

  const finishWriting = async () => {
    if (!(await persist())) return;

    try {
      await completeJournal(journal.id);
      onDone();
    } catch {
      setSaveState('error');
    }
  };

  return (
    <article className={styles.editor}>
      <div className={styles.editorMeta}>
        <span>{formatLocalDate(journal.payload.localDate, 'long')}</span>
        <span aria-live="polite">
          {saveState === 'saved'
            ? 'Saved locally'
            : saveState === 'saving'
              ? 'Saving…'
              : 'Save interrupted'}
        </span>
      </div>
      <TextField
        className={styles.titleField}
        value={title}
        onChange={setTitle}
      >
        <Label className="visually-hidden">Entry title</Label>
        <Input placeholder="Optional title" autoComplete="off" />
      </TextField>
      <TextField
        className={styles.writingField}
        value={markdown}
        onChange={setMarkdown}
      >
        <Label className="visually-hidden">Journal entry</Label>
        <TextArea
          placeholder="Write what is here…"
          autoFocus
          onBlur={() => void persist()}
        />
      </TextField>
      <Button
        className={styles.finishAction}
        aria-label="Finish writing"
        onPress={finishWriting}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m5 12.5 4.2 4.2L19 7" />
        </svg>
        <span>Finish writing</span>
      </Button>
    </article>
  );
}

function JournalReading({
  journal,
  onDelete,
}: {
  journal: JournalDocument;
  onDelete: () => Promise<void>;
}) {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const markdown = journalBody(journal.payload);

  return (
    <article className={styles.reading}>
      <div className={styles.readingMeta}>
        <p className={styles.readingDate}>
          {formatLocalDate(journal.payload.localDate, 'long')}
        </p>
        <Link className={styles.historyLink} to="/history">
          Back to history
        </Link>
      </div>
      <h2>{entryHeading(journal)}</h2>
      {markdown ? (
        <div className={styles.markdown}>
          <ReactMarkdown>{markdown}</ReactMarkdown>
        </div>
      ) : (
        <p className={styles.emptyEntry}>This entry is still quiet.</p>
      )}
      <div className={styles.readingActions}>
        {isConfirmingDelete ? (
          <div className={styles.confirmDelete}>
            <span>Delete this entry?</span>
            <Button className={styles.deleteButton} onPress={onDelete}>
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
            Delete entry
          </Button>
        )}
      </div>
    </article>
  );
}

export function JournalPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const selectedId = searchParams.get('entry');
  const selectedJournal = useLiveQuery(async () => {
    if (!selectedId) return null;
    return (await loadJournal(selectedId)) ?? null;
  }, [selectedId]);
  const isDraft = selectedJournal?.payload.status === 'draft';

  const beginEntry = async () => {
    const journal = await createJournal();
    setSearchParams({ entry: journal.id, mode: 'write' });
  };

  const deleteSelected = async () => {
    if (!selectedJournal) return;
    await deleteJournal(selectedJournal.id);
    navigate('/history');
  };

  return (
    <section className={styles.page}>
      {!selectedId ? (
        <header className={styles.pageHeader}>
          <div>
            <p className={styles.eyebrow}>Write freely</p>
            <h1>Journal</h1>
          </div>
          <Button className={styles.newEntryButton} onPress={beginEntry}>
            New entry
          </Button>
        </header>
      ) : null}

      {selectedJournal && isDraft ? (
        <JournalEditor
          key={selectedJournal.id}
          journal={selectedJournal}
          onDone={() => setSearchParams({ entry: selectedJournal.id })}
        />
      ) : null}

      {selectedJournal && !isDraft ? (
        <JournalReading journal={selectedJournal} onDelete={deleteSelected} />
      ) : null}

      {selectedId && selectedJournal === null ? (
        <div className={styles.invitation}>
          <p>This journal entry is no longer available.</p>
          <Link className={styles.historyLink} to="/history">
            Back to history
          </Link>
        </div>
      ) : null}

      {!selectedId ? (
        <div className={styles.invitation}>
          <p>Begin wherever you are now, or return to your history.</p>
          <Link className={styles.historyLink} to="/history">
            View history
          </Link>
        </div>
      ) : null}
    </section>
  );
}
