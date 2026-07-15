import type { TaskDocument } from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Button, Form, Input, Label, TextField } from 'react-aria-components';

import {
  addTask,
  deleteTask,
  documentTable,
  setTaskCompleted,
  swapTaskOrder,
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
    .sort((left, right) =>
      (left.sortKey ?? left.id).localeCompare(right.sortKey ?? right.id),
    );
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

  const moveTask = async (taskIndex: number, offset: -1 | 1) => {
    if (!tasks) {
      return;
    }

    const task = tasks[taskIndex];
    const neighbor = tasks[taskIndex + offset];

    if (task && neighbor) {
      await swapTaskOrder(task.id, neighbor.id);
    }
  };

  return (
    <section className={styles.section} aria-labelledby="tasks-heading">
      <div className={styles.headingRow}>
        <div>
          <p className={styles.eyebrow}>Keep in view</p>
          <h2 id="tasks-heading">Tasks</h2>
        </div>
        {tasks ? <span className={styles.count}>{tasks.length}</span> : null}
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
        <ol className={styles.list}>
          {tasks?.map((task, index) => (
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
              </label>
              <fieldset className={styles.actions}>
                <legend className="visually-hidden">Task actions</legend>
                <Button
                  className={styles.quietButton}
                  aria-label={`Move ${task.payload.text} up`}
                  isDisabled={index === 0}
                  onPress={() => moveTask(index, -1)}
                >
                  ↑
                </Button>
                <Button
                  className={styles.quietButton}
                  aria-label={`Move ${task.payload.text} down`}
                  isDisabled={index === tasks.length - 1}
                  onPress={() => moveTask(index, 1)}
                >
                  ↓
                </Button>
                <Button
                  className={styles.quietButton}
                  aria-label={`Delete ${task.payload.text}`}
                  onPress={() => deleteTask(task.id)}
                >
                  ×
                </Button>
              </fieldset>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
