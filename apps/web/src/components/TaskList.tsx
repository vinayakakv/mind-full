import type { TaskDocument } from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import {
  Button,
  Form,
  Input,
  Label,
  TextArea,
  TextField,
} from 'react-aria-components';

import {
  addTask,
  deleteTask,
  loadTasks,
  orderTasksForList,
  setTaskCompleted,
} from '../data/tasks';
import { useCurrentTime } from '../hooks/use-current-time';
import styles from './TaskList.module.css';
import { ActionDialog } from './ui/ActionDialog';

const visibleTasks = (
  documents: Awaited<ReturnType<typeof loadTasks>>,
  now: string,
) => {
  return orderTasksForList(
    documents.filter(
      (task) =>
        !task.deletedAt &&
        (!task.payload.availableFrom || task.payload.availableFrom <= now),
    ),
  );
};

export function TaskList() {
  const now = useCurrentTime('minute').toISOString();
  const tasks = useLiveQuery(
    async () => visibleTasks(await loadTasks(), now),
    [now],
  );
  const [isCreating, setIsCreating] = useState(false);
  const [taskText, setTaskText] = useState('');
  const [reminderLocal, setReminderLocal] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>(
    'idle',
  );

  const closeTaskDialog = () => {
    setIsCreating(false);
    setTaskText('');
    setReminderLocal('');
    setSaveState('idle');
  };

  const submitTask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedText = taskText.trim().replace(/\s+/g, ' ');

    if (!normalizedText || saveState === 'saving') {
      return;
    }

    setSaveState('saving');
    try {
      await addTask(
        normalizedText,
        reminderLocal ? new Date(reminderLocal).toISOString() : null,
      );
      closeTaskDialog();
    } catch {
      setSaveState('error');
    }
  };

  const incompleteTasks =
    tasks?.filter(({ payload }) => !payload.completedAt) ?? [];
  const completedTasks =
    tasks?.filter(({ payload }) => payload.completedAt) ?? [];

  const taskRow = (task: TaskDocument) => (
    <li
      key={task.id}
      className={`${styles.task} ${task.payload.completedAt ? styles.completed : ''}`}
    >
      <label className={styles.taskLabel}>
        <input
          type="checkbox"
          checked={Boolean(task.payload.completedAt)}
          onChange={(event) =>
            setTaskCompleted(task.id, event.currentTarget.checked)
          }
        />
        <span className={styles.taskText}>
          <span>{task.payload.text}</span>
          {task.payload.reminderAt && !task.payload.completedAt ? (
            <small className={styles.reminderTime}>
              {new Intl.DateTimeFormat(undefined, {
                weekday: 'short',
                hour: 'numeric',
                minute: '2-digit',
              }).format(new Date(task.payload.reminderAt))}
            </small>
          ) : null}
        </span>
      </label>
      <Button
        className={styles.deleteButton}
        aria-label={`Delete ${task.payload.text}`}
        onPress={() => deleteTask(task.id)}
      >
        ×
      </Button>
    </li>
  );

  return (
    <section className={styles.section} aria-labelledby="tasks-heading">
      <div className={styles.headingRow}>
        <div>
          <p className={styles.eyebrow}>Keep in view</p>
          <h2 id="tasks-heading">Tasks</h2>
        </div>
        <div className={styles.headingActions}>
          {tasks ? (
            <span className={styles.count}>{incompleteTasks.length}</span>
          ) : null}
          <Button
            className={styles.newTaskButton}
            onPress={() => setIsCreating(true)}
          >
            Add task
          </Button>
        </div>
      </div>

      {isCreating ? (
        <ActionDialog
          eyebrow="Keep in view"
          title="Add a task"
          onClose={closeTaskDialog}
        >
          <Form className={styles.taskForm} onSubmit={submitTask}>
            <TextField
              value={taskText}
              onChange={(value) => {
                setTaskText(value);
                setSaveState('idle');
              }}
              isRequired
              isDisabled={saveState === 'saving'}
            >
              <Label>Task</Label>
              <TextArea
                rows={2}
                maxLength={500}
                placeholder="A small thing to remember…"
                autoFocus
              />
            </TextField>
            <TextField
              value={reminderLocal}
              onChange={setReminderLocal}
              isDisabled={saveState === 'saving'}
            >
              <Label>
                Reminder <span>Optional</span>
              </Label>
              <Input type="datetime-local" />
            </TextField>
            {saveState === 'error' ? (
              <p className={styles.error} role="alert">
                The task could not be saved. Please try again.
              </p>
            ) : null}
            <div className={styles.formActions}>
              <Button
                type="submit"
                className={styles.primaryButton}
                isDisabled={!taskText.trim() || saveState === 'saving'}
              >
                {saveState === 'saving' ? 'Adding…' : 'Add task'}
              </Button>
              <Button className={styles.textButton} onPress={closeTaskDialog}>
                Cancel
              </Button>
            </div>
          </Form>
        </ActionDialog>
      ) : null}

      {tasks?.length === 0 ? (
        <p className={styles.empty}>Nothing is asking for your attention.</p>
      ) : (
        <>
          <ol className={styles.list}>{incompleteTasks.map(taskRow)}</ol>
          {completedTasks.length ? (
            <section
              className={styles.completedGroup}
              aria-labelledby="completed-tasks-heading"
            >
              <h3 id="completed-tasks-heading">Completed</h3>
              <ol className={styles.list}>{completedTasks.map(taskRow)}</ol>
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}
