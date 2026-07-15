import type { TaskDocument } from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Button, Form, Input, Label, TextField } from 'react-aria-components';

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
  const [taskText, setTaskText] = useState('');
  const [reminderLocal, setReminderLocal] = useState('');

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
    setTaskText('');
    setReminderLocal('');
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
        {tasks ? (
          <span className={styles.count}>{incompleteTasks.length}</span>
        ) : null}
      </div>

      <Form className={styles.form} onSubmit={submitTask}>
        <TextField
          aria-label="New task"
          value={taskText}
          onChange={setTaskText}
          className={styles.textField}
        >
          <Label className="visually-hidden">New task</Label>
          <Input placeholder="A small thing to remember…" />
        </TextField>
        <Button type="submit" className={styles.addButton}>
          Add
        </Button>
        <details className={styles.reminderField}>
          <summary>Add a reminder</summary>
          <TextField value={reminderLocal} onChange={setReminderLocal}>
            <Label>Reminder time</Label>
            <Input type="datetime-local" />
          </TextField>
        </details>
      </Form>

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
