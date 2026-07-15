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
  createJournal,
  deleteJournal,
  documentTable,
  updateJournal,
} from '../data/documents';
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
    async (draft = latestDraft.current): Promise<void> => {
      if (
        draft.title === lastSaved.current.title &&
        draft.markdown === lastSaved.current.markdown
      ) {
        return;
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
      } catch {
        setSaveState('error');
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
    await persist();
    onDone();
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
      <div className={styles.editorFooter}>
        <span>Markdown is welcome. Plain words are enough.</span>
        <Button className={styles.primaryButton} onPress={finishWriting}>
          Finish writing
        </Button>
      </div>
    </article>
  );
}

function JournalReading({
  journal,
  onEdit,
  onDelete,
}: {
  journal: JournalDocument;
  onEdit: () => void;
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
        <Button className={styles.primaryButton} onPress={onEdit}>
          Continue writing
        </Button>
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
  const isWriting = searchParams.get('mode') === 'write';
  const selectedJournal = useLiveQuery(async () => {
    if (!selectedId) return undefined;
    const document = await documentTable().get(selectedId);
    return document?.type === 'journal' && !document.deletedAt
      ? document
      : undefined;
  }, [selectedId]);

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
      {!isWriting && !selectedId ? (
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

      {selectedJournal && isWriting ? (
        <JournalEditor
          key={selectedJournal.id}
          journal={selectedJournal}
          onDone={() => setSearchParams({ entry: selectedJournal.id })}
        />
      ) : null}

      {selectedJournal && !isWriting ? (
        <JournalReading
          journal={selectedJournal}
          onEdit={() =>
            setSearchParams({ entry: selectedJournal.id, mode: 'write' })
          }
          onDelete={deleteSelected}
        />
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
