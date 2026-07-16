import type { TaskDocument } from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import {
  Button,
  Dialog,
  Form,
  Heading,
  Input,
  Label,
  Modal,
  ModalOverlay,
  TextField,
} from 'react-aria-components';

import {
  addTask,
  deleteTask,
  documentTable,
  setTaskCompleted,
} from '../data/documents';
import styles from './TaskList.module.css';

const visibleTasks = (documents: Awaited<ReturnType<typeof loadTasks>>) => {
  const now = new Date().toISOString();

  return documents
    .filter(
      (task) =>
        !task.deletedAt &&
        (!task.payload.availableFrom || task.payload.availableFrom <= now),
    )
    .sort((left, right) => {
      const completionOrder =
        Number(Boolean(left.payload.completedAt)) -
        Number(Boolean(right.payload.completedAt));
      return completionOrder || left.createdAt.localeCompare(right.createdAt);
    });
};

const loadTasks = async (): Promise<TaskDocument[]> => {
  const documents = await documentTable()
    .where('type')
    .equals('task')
    .toArray();
  return documents.filter(
    (document): document is TaskDocument => document.type === 'task',
  );
};

export function TaskList() {
  const tasks = useLiveQuery(async () => visibleTasks(await loadTasks()), []);
  const [isCreating, setIsCreating] = useState(false);
  const [taskText, setTaskText] = useState('');
  const [reminderLocal, setReminderLocal] = useState('');

  const closeTaskDialog = () => {
    setIsCreating(false);
    setTaskText('');
    setReminderLocal('');
  };

  const submitTask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedText = taskText.trim();

    if (!trimmedText) {
      return;
    }

    await addTask(
      trimmedText,
      reminderLocal ? new Date(reminderLocal).toISOString() : null,
    );
    closeTaskDialog();
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
        <ModalOverlay
          className={styles.modalOverlay}
          isOpen
          isDismissable
          onOpenChange={(isOpen) => {
            if (!isOpen) closeTaskDialog();
          }}
        >
          <Modal className={styles.modal}>
            <Dialog className={styles.dialog}>
              <div className={styles.dialogHeading}>
                <div>
                  <p>Keep in view</p>
                  <Heading slot="title">Add a task</Heading>
                </div>
                <Button
                  className={styles.closeButton}
                  aria-label="Close"
                  onPress={closeTaskDialog}
                >
                  ×
                </Button>
              </div>
              <Form className={styles.taskForm} onSubmit={submitTask}>
                <TextField
                  value={taskText}
                  onChange={setTaskText}
                  isRequired
                  autoFocus
                >
                  <Label>Task</Label>
                  <Input placeholder="A small thing to remember…" />
                </TextField>
                <TextField value={reminderLocal} onChange={setReminderLocal}>
                  <Label>
                    Reminder <span>Optional</span>
                  </Label>
                  <Input type="datetime-local" />
                </TextField>
                <div className={styles.formActions}>
                  <Button
                    type="submit"
                    className={styles.primaryButton}
                    isDisabled={!taskText.trim()}
                  >
                    Add task
                  </Button>
                  <Button
                    className={styles.textButton}
                    onPress={closeTaskDialog}
                  >
                    Cancel
                  </Button>
                </div>
              </Form>
            </Dialog>
          </Modal>
        </ModalOverlay>
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
